// Deploy with JWT verification enabled. Provider credentials stay in server secrets.
const headers = {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
 'Content-Type': 'application/json',
 'Cache-Control': 'no-store'
};
const cache = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const attempts = new Map<string, number>();
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
type AirportEvent = { icao?: string; actual_runway?: string; actual?: string };
type ProviderFlight = {
 flight_date?: string; flight_status?: string;
 departure?: AirportEvent; arrival?: AirportEvent;
 flight?: { iata?: string; codeshared?: unknown };
};

async function lookup(dep: string, arr: string, key: string) {
 const url = new URL('https://api.aviationstack.com/v1/flights');
 url.search = new URLSearchParams({ access_key: key, dep_icao: dep, arr_icao: arr, flight_status: 'landed', limit: '100' }).toString();
 const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
 const result = await response.json().catch(() => null);
 const code = result?.error?.code;
 if (['usage_limit_reached', 'rate_limit_reached', 'invalid_access_key',
      'function_access_restricted', 'https_access_restricted'].includes(code)) throw Error(code);
 if (response.status === 429) throw Error('rate_limit_reached');
 if (!response.ok || !Array.isArray(result?.data)) throw Error('flight_data_unavailable');
 const seen = new Set<string>();
 const values: number[] = [];
 for (const flight of result.data as ProviderFlight[]) {
  if (flight.departure?.icao !== dep || flight.arrival?.icao !== arr || flight.flight_status !== 'landed' || flight.flight?.codeshared) continue;
  const id = flight.flight_date + ':' + flight.flight?.iata;
  if (!flight.flight?.iata || seen.has(id)) continue;
  // Compare like timestamps. Gate-to-gate duration is used for the planned arrival.
  const start = Date.parse(flight.departure.actual ?? '');
  const end = Date.parse(flight.arrival.actual ?? '');
  const minutes = (end - start) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes >= 1440 || end > Date.now()) continue;
  seen.add(id); values.push(minutes);
 }
 values.sort((a, b) => a - b);
 const mid = Math.floor(values.length / 2);
 return { minutes: values.length ? Math.round(values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2) : null,
  count: values.length, source: 'aviationstack', basis: 'actual-gate', checkedAt: new Date().toISOString() };
}

Deno.serve(async request => {
 if (request.method === 'OPTIONS') return new Response(null, { headers });
 if (request.method !== 'POST') return reply({ error: 'method' }, 405);
 try {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return reply({ error: 'auth' }, 401);
  const userResponse = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
   headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY')! }, signal: AbortSignal.timeout(8000)
  });
  if (!userResponse.ok) return reply({ error: 'auth' }, 401);
  const user = await userResponse.json();
  const { dep, arr } = await request.json();
  if (typeof dep !== 'string' || typeof arr !== 'string' || !/^[A-Z]{4}$/.test(dep) || !/^[A-Z]{4}$/.test(arr) || dep === arr)
   return reply({ error: 'route' }, 400);
  const route = dep + '-' + arr;
  const saved = cache.get(route);
  if (saved && saved.expires > Date.now()) return reply(saved.value);
  const previous = attempts.get(user.id) ?? 0;
  if (Date.now() - previous < 10000) return reply({ error: 'rate_limit_reached' }, 429);
  attempts.set(user.id, Date.now());
  const key = Deno.env.get('AVIATIONSTACK_KEY');
  if (!key) return reply({ error: 'provider_not_configured' }, 503);
  let result = pending.get(route);
  if (!result) {
   result = lookup(dep, arr, key);
   pending.set(route, result);
  }
  try {
   const value = await result;
   if (cache.size > 500) cache.delete(cache.keys().next().value!);
   if (attempts.size > 5000) attempts.clear();
   cache.set(route, { value, expires: Date.now() + 60 * 60 * 1000 });
   return reply(value);
  } finally {
   if (pending.get(route) === result) pending.delete(route);
  }
 } catch (error) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'usage_limit_reached' || code === 'rate_limit_reached') return reply({ error: code }, 429);
  if (['invalid_access_key', 'function_access_restricted', 'https_access_restricted'].includes(code))
   return reply({ error: code }, 502);
  return reply({ error: 'flight_data_unavailable' }, 502);
 }
});
