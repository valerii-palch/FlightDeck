const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
test('startup and 30-minute checks use the native bridge and avoid concurrent checks/installations',()=>{
 const requests=[],timers=[];
 const context=vm.createContext({
  window:{webkit:{messageHandlers:{updateApplication:{postMessage:action=>requests.push(action)}}}},
  document:{addEventListener(){}},
  byId:()=>({addEventListener(){},open:false}),
  setInterval:(callback,delay)=>{timers.push({callback,delay});return timers.length;}
 });
 vm.runInContext(readFileSync(join(__dirname,'../FlightDesk/updates.js'),'utf8')+
  ';paintUpdateDialog=()=>{};startApplicationUpdates();startApplicationUpdates();',context);
 assert.deepEqual(requests,['check']);
 assert.equal(timers.length,1);
 assert.equal(timers[0].delay,1800000);
 timers[0].callback();assert.equal(requests.length,1);
 vm.runInContext("window.flightDeckUpdateStatus('current')",context);
 timers[0].callback();assert.equal(requests.length,2);
 vm.runInContext("window.flightDeckUpdateStatus('installing')",context);
 timers[0].callback();assert.equal(requests.length,2);
});
