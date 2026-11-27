const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const cloud = readFileSync(join(__dirname, '../FlightDesk/cloud.js'), 'utf8');

function createHarness() {
  const context = vm.createContext({
    window: {}, navigator: { onLine: true }, document: {}, setTimeout, clearTimeout, structuredClone
  });
  vm.runInContext(cloud + `
    const tr = key => key;
    const byId = () => undefined;
    const preferences = () => ({ profileName: '', ...data.preferences });
    const profilePhotoOwner = () => cloudSession?.user.id;
    const validProfilePhoto = value => value === 'test-photo';
    const storeProfilePhoto = photo => { data.preferences={...data.preferences,profilePhotos:{[cloudSession?.user.id]:photo}}; };
    const validBackup = value => Array.isArray(value.flights) && Array.isArray(value.airports);
    const save = () => {};
    const airport = () => null;
    const flight = () => null;
    const pickTail = () => {};
    let airportCode = '', tail = 'RA-73709', explicitAircraft = false;
    let data = { flights: [], airports: [] };
    let journalOwner;
    const deviceJournals = new Map();
    const rows = new Map();
    const writes = [];
    let beforeWrite;
    cloudRequest = async (path, options) => {
      const owner = cloudSession.user.id;
      const row = rows.get(owner);
      if (!options.method) return row ? [structuredClone(row)] : [];
      const requestedVersion = row ? row.version : 0;
      beforeWrite?.();
      if (row && !path.endsWith('version=eq.' + requestedVersion)) return [];
      if (beforeWrite && rows.get(owner) !== row) return [];
      const saved = { version: options.body.version, journal: structuredClone(options.body.journal) };
      rows.set(owner, saved);
      writes.push({ owner, ...saved });
      return [saved];
    };
    const account = async owner => {
      await acceptCloudSession({ user: { id: owner }, access_token: 'fake', refresh_token: 'fake', expires_in: 3600 });
      loadCloudCheckpoint();
    };
    const copy = (...ids) => ({ flights: ids.map(id => ({ id })), airports: [], profileName: '', profilePhoto: '' });
  `, context);
  return code => vm.runInContext('(async()=>{' + code + '})()', context);
}

test('initial sync, remote refresh, and explicit conflict resolution', async () => {
  const run = createHarness();
  const result = await run(`
    await account('a');
    data.flights = copy('original').flights;
    await synchronizeCloud();
    rows.set('a', { version: 2, journal: copy('remote') });
    await synchronizeCloud();
    const pulled = cloudSnapshot().flights[0].id;
    data.flights = copy('local edit').flights;
    rows.set('a', { version: 3, journal: copy('remote edit') });
    const conflict = await synchronizeCloud();
    await synchronizeCloud('upload', conflict);
    return [pulled, conflict.local.flights[0].id, conflict.remote.flights[0].id, rows.get('a').journal.flights[0].id];
  `);
  assert.deepEqual(Array.from(result), ['remote', 'local edit', 'remote edit', 'local edit']);
});

test('switching accounts never uploads another account’s flights or drops pending local edits', async () => {
  const run = createHarness();
  const result = await run(`
    data.flights = copy('legacy local').flights;
    await account('a');
    await synchronizeCloud();
    data.flights = copy('unsynced A').flights;
    await account('b');
    await synchronizeCloud();
    const initialB = rows.get('b').journal.flights.length;
    data.flights = copy('B only').flights;
    await synchronizeCloud();
    await account('a');
    const restoredA = cloudSnapshot().flights[0].id;
    await synchronizeCloud();
    return [initialB, restoredA, rows.get('a').journal.flights[0].id, rows.get('b').journal.flights[0].id];
  `);
  assert.deepEqual(Array.from(result), [0, 'unsynced A', 'unsynced A', 'B only']);
});

test('a newer remote revision or a local change invalidates a displayed conflict', async () => {
  const run = createHarness();
  const result = await run(`
    await account('a');
    data.flights = copy('local').flights;
    rows.set('a', { version: 1, journal: copy('remote') });
    const conflict = await synchronizeCloud();
    rows.set('a', { version: 2, journal: copy('updated') });
    const staleRemote = await synchronizeCloud('download', conflict).then(() => false, () => true);
    const fresh = await synchronizeCloud();
    data.flights = copy('local changed').flights;
    const staleLocal = await synchronizeCloud('upload', fresh).then(() => false, () => true);
    return [staleRemote, staleLocal, writes.length, data.flights[0].id, rows.get('a').journal.flights[0].id];
  `);
  assert.deepEqual(Array.from(result), [true, true, 0, 'local changed', 'updated']);
});

test('concurrent server writes reject compare-and-swap; local changes remain available', async () => {
  const run = createHarness();
  const result = await run(`
    await account('a');
    data.flights = copy('first').flights;
    await synchronizeCloud();
    data.flights = copy('local').flights;
    beforeWrite = () => rows.set('a', { version: 2, journal: copy('concurrent') });
    const rejected = await synchronizeCloud().then(() => false, () => true);
    return [rejected, cloudSnapshot().flights[0].id, rows.get('a').journal.flights[0].id];
  `);
  assert.deepEqual(Array.from(result), [true, 'local', 'concurrent']);
});

test('logbook clearing preserves profile, photo, airports, hubs and local settings',async()=>{
 const run=createHarness();
 const result=await run(`
  await account('a');
  data.flights=copy('one','two').flights;
  data.airports=[{icao:'TEST',name:'Custom airport',hubLevel:1}];
  data.preferences={profileName:'Pilot',profilePhotos:{a:'test-photo'},theme:'evening'};
  await synchronizeCloud();
  await clearCloudCollection('flights');
  return {local:cloudSnapshot(),remote:rows.get('a').journal,theme:data.preferences.theme};
 `);
 assert.equal(result.local.flights.length,0);
 assert.equal(result.remote.flights.length,0);
 assert.equal(result.local.profileName,'Pilot');
 assert.equal(result.remote.profilePhoto,'test-photo');
 assert.equal(result.local.airports[0].hubLevel,1);
 assert.equal(result.theme,'evening');
});

test('airport clearing keeps flight records and display metadata without hub or scenery flags',async()=>{
 const run=createHarness();
 const result=await run(`
  await account('a');
  data.flights=[{id:'flight',dep:'TEST',arr:'DEST',status:'Уход на запасной',diversionAirport:'ALTN',continuation:{status:'Вылетел'}}];
  data.airports=[
   {icao:'TEST',name:'Custom departure',cityRu:'Город',timezone:'Europe/Moscow',hubLevel:1,gsx:true},
   {icao:'DEST',name:'Destination',hubLevel:2},
   {icao:'ALTN',name:'Alternate'},
   {icao:'UNUS',name:'Unused'}
  ];
  data.preferences={profileName:'Pilot',theme:'night',profilePhotos:{a:'test-photo'}};
  const flights=JSON.stringify(data.flights);
  await synchronizeCloud();
  await clearCloudCollection('airports');
  return {local:cloudSnapshot(),remote:rows.get('a').journal,flights,theme:data.preferences.theme};
 `);
 assert.equal(result.local.airports.length,0);
 assert.equal(result.remote.airports.length,0);
 assert.equal(JSON.stringify(result.local.flights),result.flights);
 assert.equal(result.remote.airportHistory.TEST.name,'Custom departure');
 assert.equal(result.remote.airportHistory.TEST.timezone,'Europe/Moscow');
 assert.equal(result.remote.airportHistory.TEST.hubLevel,undefined);
 assert.equal(result.remote.airportHistory.TEST.gsx,undefined);
 assert.equal(result.remote.airportHistory.ALTN.name,'Alternate');
 assert.equal(result.remote.airportHistory.UNUS,undefined);
 assert.equal(result.local.profileName,'Pilot');
 assert.equal(result.local.profilePhoto,'test-photo');
 assert.equal(result.theme,'night');
});

test('hub priorities survive cloud updates and old records without a priority remain valid',async()=>{
 const run=createHarness();
 const result=await run(`
  await account('a');
  data.airports=[{icao:'AAAA',name:'Hub',hubLevel:2},{icao:'BBBB',name:'Legacy'}];
  await synchronizeCloud();
  rows.get('a').journal.airports[0].hubLevel=1;
  rows.get('a').version++;
  await synchronizeCloud();
  return data.airports;
 `);
 assert.equal(result[0].hubLevel,1);
 assert.equal(result[1].hubLevel,undefined);
});

test('a concurrent cloud change rejects clearing and keeps local data available',async()=>{
 const run=createHarness();
 const result=await run(`
  await account('a');
  data.flights=copy('original').flights;
  await synchronizeCloud();
  beforeWrite=()=>rows.set('a',{version:rows.get('a').version+1,journal:copy('new remote flight')});
  let error='';
  try{await clearCloudCollection('flights');}catch(e){error=e.message;}
  return [error,data.flights[0].id,rows.get('a').journal.flights[0].id];
 `);
 assert.match(result[0],/изменился/);
 assert.equal(result[1],'original');
 assert.equal(result[2],'new remote flight');
});
test('an account switch during clearing never replaces the new account journal',async()=>{
 const run=createHarness();
 const result=await run(`
  await account('a');
  data.flights=copy('account a flight').flights;
  await synchronizeCloud();
  beforeWrite=()=>{
   cloudSession={...cloudSession,user:{id:'b'}};
   data={flights:copy('account b flight').flights,airports:[],preferences:{profileName:'B'}};
  };
  let message='';
  try{await clearCloudCollection('flights');}catch(error){message=error.message;}
  return [message,cloudSession.user.id,data.flights[0].id,data.preferences.profileName];
 `);
 assert.match(result[0],/Аккаунт изменился/);
 assert.deepEqual(Array.from(result.slice(1)),['b','account b flight','B']);
});
