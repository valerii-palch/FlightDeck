const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const context=vm.createContext({});
vm.runInContext(readFileSync(join(__dirname,'../FlightDesk/views.js'),'utf8')+
 readFileSync(join(__dirname,'../FlightDesk/planning.js'),'utf8')+`
 const minute=60000;
 const clockOn=(date,time)=>time?Date.parse(date+'T'+time+':00Z'):NaN;
 const airportInfo=code=>({timezone:{UUEE:'Europe/Moscow',KJFK:'America/New_York'}[code]});
 globalThis.times=flightTimes;globalThis.local=airportLocalStamp;globalThis.utc=localToUTC;
`,context);
const base={date:'2026-12-31',std:'23:00',sta:'01:00',status:'Вылетел',atd:'23:45'};
test('ETA uses actual departure and original duration across year boundary',()=>{
 const original=JSON.stringify(base),t=context.times(base);
 assert.equal(new Date(t.estimatedArrival).toISOString(),'2027-01-01T01:45:00.000Z');
 assert.equal(JSON.stringify(base),original);
 assert.equal(t.scheduledArrival,Date.parse('2027-01-01T01:00Z'));
});
test('explicit multi-day schedules and actual arrival keep separate dates',()=>{
 const t=context.times({...base,staDate:'2027-01-03',ata:'02:00',ataDate:'2027-01-04'});
 assert.equal(new Date(t.estimatedArrival).toISOString(),'2027-01-03T01:45:00.000Z');
 assert.equal(new Date(t.actualArrival).toISOString(),'2027-01-04T02:00:00.000Z');
});
test('preflight, cancelled and missing departures have no ETA',()=>{
 for(const f of [{...base,status:'Запланирован'},{...base,status:'Отменен'},{...base,atd:''}])
  assert.ok(Number.isNaN(context.times(f).estimatedArrival));
});
test('UTC/local conversion preserves dates and handles DST gaps and overlap',()=>{
 const stamp=Date.parse('2026-11-27T23:45Z');
 assert.equal(context.local('UUEE',stamp),'2026-11-28T02:45');
 assert.equal(context.utc('UUEE','2026-11-28','02:45')[0],stamp);
 assert.equal(context.utc('KJFK','2026-03-08','02:30').length,0);
 assert.equal(context.utc('KJFK','2026-11-01','01:30').length,2);
 assert.equal(context.local('UNKNOWN',stamp),'');
});
