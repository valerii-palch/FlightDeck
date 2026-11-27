const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const context = vm.createContext({});
vm.runInContext(readFileSync(join(__dirname,'../FlightDesk/views.js'),'utf8') +
 readFileSync(join(__dirname,'../FlightDesk/journal.js'),'utf8') + `
 const minute=60000;
 const clockOn=(date,time)=>time?Date.parse(date+'T'+time+':00Z'):NaN;
 globalThis.choose=(rows)=>dashboardFlight(rows,clockOn('2026-11-27','12:00')).flight?.id;
 globalThis.setStatus=setFlightStatus;
`,context);
const flight=(id,status,date='2026-11-27',extra={})=>({id,status,date,std:'10:00',sta:'13:00',...extra});
const completed=flight('completed','Выполнен','2026-11-26');
const planned=flight('planned','Запланирован','2026-11-28');
const active=flight('active','Вылетел','2026-11-27',{atd:'10:00'});
test('active statuses outrank scheduled and completed regardless of date',()=>{
 for(const status of ['Подготовка','Загрузка багажа','Идет посадка','Посадка завершена','Вылетел','Задержан'])
  assert.equal(context.choose([completed,planned,flight('active',status,'2026-11-20')]),'active');
});
test('closest scheduled stays available after departure time, cancelled is excluded',()=>{
 assert.equal(context.choose([completed,planned,flight('earlier','Запланирован')]),'earlier');
 assert.equal(context.choose([completed,flight('cancelled','Отменен')]),'completed');
 assert.equal(context.choose([]),undefined);
});
test('diversion remains active until continuation completes',()=>{
 const diverted=flight('diverted','Уход на запасной','2026-11-26',{diversionAirport:'USPP',ata:'12:00'});
 for(const continuation of [undefined,flight('leg','Запланирован'),flight('leg','Вылетел'),flight('leg','Отменен')])
  assert.equal(context.choose([completed,planned,{...diverted,continuation}]),'diverted');
 assert.equal(context.choose([completed,planned,{...diverted,continuation:flight('leg','Выполнен')}]),'planned');
});
test('status changes switch the selected flight immediately',()=>{
 const current={...active};
 const rows=[completed,planned,current];
 assert.equal(context.choose(rows),'active');
 assert.ok(context.setStatus(current,'Выполнен',Date.parse('2026-11-27T13:00:00Z')));
 assert.equal(context.choose(rows),'planned');
 assert.ok(context.setStatus(planned,'Отменен'));
 assert.equal(context.choose(rows),'active');
 assert.ok(context.setStatus(current,'Подготовка'));
 assert.equal(context.choose(rows),'active');
});
test('latest completion uses final arrival including overnight continuation',()=>{
 const diverted=flight('diverted','Уход на запасной','2026-11-25',{
  diversionAirport:'USPP',ata:'12:00',
  continuation:flight('leg','Выполнен','2026-11-26',{std:'23:00',sta:'01:00',atd:'23:10',ata:'01:10'})
 });
 assert.equal(context.choose([completed,diverted]),'diverted');
});
