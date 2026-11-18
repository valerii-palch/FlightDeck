const realRouteCache = new Map();
async function lookupRealRoute(dep, arr, signal) {
 const userID=cloudSession?.user.id;
 if(!userID) throw Error('route_sign_in');
 const route=dep+'-'+arr;
 let cached=realRouteCache.get(route);
 if(!cached)try{cached=JSON.parse(localStorage.getItem('flightdeck.realRoute.'+route)||'null');}catch{}
 if(cached&&(!Number.isFinite(cached.expires)||!cached.value||!Number.isInteger(cached.value.count)||cached.value.count<0||
   (cached.value.minutes!==null&&(!Number.isFinite(cached.value.minutes)||cached.value.minutes<=0||cached.value.minutes>=1440))))cached=null;
 if(cached&&cached.expires>Date.now()) return cached.value;
 const token=await cloudToken();
 signal.throwIfAborted();
 if(cloudSession?.user.id!==userID) throw Error('route_sign_in');
 const response=await fetch(cloudURL+'/functions/v1/route-duration',{
  method:'POST',signal,referrerPolicy:'no-referrer',
  headers:{apikey:cloudKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({dep,arr})
 });
 if(response.status===401||response.status===403) throw Error('route_sign_in');
 const result=await response.json().catch(()=>null);
 if(response.status===429) throw Error(result?.error||'rate_limit_reached');
 if(!response.ok) throw Error(result?.error||'flight_data_unavailable');
 if(!Number.isInteger(result?.count)||result.count<0||
   (result.count===0?result.minutes!==null:!Number.isFinite(result.minutes)||result.minutes<=0||result.minutes>=1440))
  throw Error('flight_data_unavailable');
 const value={minutes:result.minutes,count:result.count,source:'real'};
 const entry={value,expires:Date.now()+(value.count?3600000:600000)};
 realRouteCache.set(route,entry);
 try{localStorage.setItem('flightdeck.realRoute.'+route,JSON.stringify(entry));}catch{}
 return value;
}
function realRouteError(error){
 if(error.message==='route_sign_in')return tr('Войди в FlightDeck, чтобы получить оценку по реальным рейсам.');
 if(['usage_limit_reached','rate_limit_reached'].includes(error.message))return tr('Достигнут лимит запросов Aviationstack.');
 if(['function_access_restricted','https_access_restricted'].includes(error.message))return tr('Тариф Aviationstack не поддерживает этот запрос.');
 if(error.message==='invalid_access_key')return tr('Aviationstack отклонил ключ API.');
 return tr('База реальных рейсов недоступна.');
}
