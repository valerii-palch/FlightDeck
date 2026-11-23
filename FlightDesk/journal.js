const flightTypes = ['Регулярный','Чартерный','Перегоночный'];
const flightType = f => flightTypes.includes(f.type) ? f.type : 'Не указан';
const alternate = f => f.diversionAirport || f.note?.match(/Запасной аэропорт\s+([A-Z]{4})/i)?.[1]?.toUpperCase() || '';
const isDiversion = f => f.status==='Уход на запасной';
const continuationLeg = f => isDiversion(f)&&f.continuation
 ? {...f.continuation,dep:alternate(f),arr:f.arr,number:f.number,tail:f.tail,type:f.type,id:f.id,demo:f.demo} : null;
const legFlown = leg => leg.status!=='Отменен' && (!!leg.ata || leg.status==='Выполнен' || (isDiversion(leg)&&Number.isFinite(leg.actualMinutes)));
function alternateLanded(f) {
 const next=continuationLeg(f);
 return isDiversion(f)&&!!alternate(f)&&(legFlown(f)||!!next&&(!!next.atd||next.status==='Вылетел'||legFlown(next)));
}
function physicalLegs(f) {
 const next=continuationLeg(f);
 const first=isDiversion(f)?{...f,arr:alternate(f)}:f;
 return next?[first,next]:[first];
}

function migrateDiversion(state) {
 // The source workbook records the documented SU 1485 continuation as row 3-62.
 const first=state.flights.find(f=>f.id==='3-60');
 const next=state.flights.find(f=>f.id==='3-62');
 if (!first || !next || first.continuation || !isDiversion(first) || first.number!=='SU 1485' ||
     (next.number && next.number!==first.number) || next.tail!==first.tail ||
     next.dep!==alternate(first) || next.arr!==first.arr || next.date!==first.date) return state;
 const {id,tail,dep,arr,number,pax,...continuation}=next;
 first.continuation={...continuation,originalId:id,originalPax:pax};
 state.flights=state.flights.filter(f=>f!==next);
 return state;
}

function continuationPanel(f) {
 if (!isDiversion(f)) return '';
 const next=continuationLeg(f);
 const destination=alternate(f);
 const landing=stampLabel(flightTimes(f).actualArrival,f.date);
 return `<section id="continuationPanel" class="panel facts" tabindex="-1"><h2>${tr("Уход на запасной")}</h2>`+
 '<p>'+codeLabel(f.dep)+' → '+(destination?codeLabel(destination):tr("Запасной не указан"))+` <span class="muted">· ${tr("Посадка")} `+landing+'</span></p>'+
 (next?'<div class="strip"><p>'+codeLabel(next.dep)+' → '+codeLabel(next.arr)+' · '+flightNumber(next)+'</p>'+
 '<p class="muted">'+displayDate(next.date)+' · '+esc(next.std)+' → '+esc(next.sta)+' UTC · '+esc(tr(journalStatus(next)))+'</p>'+
 (next.atd||next.ata?`<p>${tr("Факт:")} `+stampLabel(flightTimes(next).actualDeparture,next.date)+' → '+stampLabel(flightTimes(next).actualArrival,next.date)+' '+delayBadge(f)+'</p>':'')+'</div>':'')+
 '<button class="facts" data-action="'+(destination?'continuation':'divert')+'">'+(next?tr("Изменить продолжение"):destination?tr("Добавить продолжение"):tr("Указать запасной"))+'</button></section>';
}

function continuationDefaults(f,inbound) {
 const times=flightTimes(f);
 const takeoff=(Number.isFinite(inbound)?inbound:times.scheduledArrival)+60*minute;
 const from=airportInfo(alternate(f)), to=airportInfo(f.arr);
 const distance=hasCoordinates(from)&&hasCoordinates(to)?Math.acos(Math.max(-1,Math.min(1,
  Math.sin(rad(from.lat))*Math.sin(rad(to.lat))+Math.cos(rad(from.lat))*Math.cos(rad(to.lat))*Math.cos(rad(to.lon-from.lon))
 )))*6371:NaN;
 const speed=aircraftFor(f.tail)?.short==='A321'?820:880;
 const routeMinutes=routeDurationEstimate(alternate(f),f.arr,f.tail,f.id)?.minutes||
  (Number.isFinite(distance)?Math.max(15,Math.ceil((15+distance/speed*60)/5)*5):
   Math.max(15,Math.round((times.scheduledArrival-times.scheduledDeparture)/minute)||60));
 const departure=new Date(Number.isFinite(takeoff)?takeoff:Date.now()+60*minute).toISOString();
 const arrival=new Date(Date.parse(departure)+routeMinutes*minute).toISOString();
 return {date:departure.slice(0,10),std:departure.slice(11,16),sta:arrival.slice(11,16),status:'Запланирован'};
}
function editContinuation(f) {
 const inbound=flightTimes(f).actualArrival;
 const next=continuationLeg(f);
 const leg=next||continuationDefaults(f,inbound);
 const field=(key,label,type,required=false)=>'<label>'+label+(type==='date'?dateField(key,leg[key],required):type==='time'?timeField(key,leg[key],required):'<input name="'+key+'" type="'+type+'" value="'+esc(leg[key])+'" '+(required?'required':'')+'>')+'</label>';
 const allowed=['Запланирован','Задержан','Вылетел','Выполнен','Отменен'];
 openDialog(`<h2>${tr("Продолжение ·")} `+flightNumber(f)+'</h2><p>'+codeLabel(alternate(f))+' → '+codeLabel(f.arr)+'</p>'+
 (!next?`<p class="muted">${tr(Number.isFinite(inbound)?'Вылет предложен через 60 минут после посадки на запасном. Время можно изменить.':'Посадка на запасном ещё не отмечена. Времена предложены по исходному расписанию, их можно изменить.')}</p>`:'')+
 '<form id="continuationForm" class="editor two facts">'+field('date',tr("Дата вылета по плану UTC"),'date',true)+
 `<label>${tr("Статус")}<select name="status">`+allowed.map(s=>option(s,tr(s),leg.status)).join('')+'</select></label>'+
 field('std',tr("Вылет по плану UTC"),'time',true)+field('sta',tr("Прилет по плану UTC"),'time',true)+
 field('atd',tr("Вылет фактически UTC"),'time')+field('ata',tr("Прилет фактически UTC"),'time')+
 field('atdDate',tr("Дата фактического вылета UTC"),'date')+field('ataDate',tr("Дата фактического прилета UTC"),'date')+
 `<label>${tr("Время полета, мин")}<input name="actualMinutes" type="number" readonly value="`+esc(leg.actualMinutes)+'"></label>'+
 `<label class="full">${tr("Примечание")}<textarea name="note" rows="2">`+esc(leg.note)+'</textarea></label>'+
 `<div class="full controls"><button class="primary">${tr("Сохранить")}</button><button type="button" data-action="close">${tr("Отмена")}</button>`+
 (next?`<button type="button" id="removeContinuation">${tr("Удалить продолжение")}</button>`:'')+'</div></form>');
 const form=byId('continuationForm');
 bindActualDuration(form,leg);
 if (next) byId('removeContinuation').onclick=event=>{
  const button=event.currentTarget;
  if (button.dataset.confirmed!=='true') {
   button.dataset.confirmed='true';
   button.textContent=tr("Подтвердить удаление");
   return;
  }
  delete f.continuation;
  save();byId('dialog').close();render();
 };
 form.addEventListener('input',e=>e.target.setCustomValidity?.(''));
 form.onsubmit=e=>{
  e.preventDefault();
  const values=flightFormValues(form);
  if(!values)return;
  const times=flightTimes(values);
  values.actualMinutes=actualFlightMinutes(values,times)??legacyFlightMinutes(leg,values);
  let error='';
  let key='ata';
  if (values.status==='Выполнен'&&!values.ata) error=tr("Укажи фактическое время прилета.");
  if (times.actualArrival<times.actualDeparture) error=tr("Прилет должен быть после вылета.");
  if (Number.isFinite(inbound)&&((times.actualDeparture||times.scheduledDeparture)<inbound)) {
   error=tr("Продолжение вылетает после посадки на запасном. Проверь дату и время UTC.");
   key=values.atd?'atd':'std';
  }
  if (Number.isFinite(inbound)&&times.actualArrival<inbound) error=tr("Прибытие должно быть после посадки на запасном.");
  if (error) {form.elements[key].setCustomValidity(error);form.reportValidity();return;}
  f.continuation={...f.continuation,...values};
  save();byId('dialog').close();render();
 };
}

function boardRow(f, kind, date, groupDate) {
 const t=flightTimes(f);
 const city=code=>esc(airportCity(code));
 const stop=kind==='diverted';
 const place=(code,label,original='')=>'<td class="board-place"><span class="board-mobile-label">'+label+'</span>'+
  (original?'<del class="board-original" title="'+city(original)+'">'+city(original)+'</del>':'')+
  '<strong class="board-city" title="'+city(code)+'">'+city(code)+'</strong><span class="board-route">'+codeLabel(code)+'</span></td>';
 const changed=Number.isFinite(t.actualDeparture)&&t.actualDeparture!==t.scheduledDeparture;
 const clock=stamp=>Number.isFinite(stamp)?formatTime(stamp,date):'—';
 const time='<span class="board-time">'+(changed?'<del>'+clock(t.scheduledDeparture)+'</del><strong>'+clock(t.actualDeparture)+'</strong>':'<strong>'+clock(t.scheduledDeparture)+'</strong>')+'</span>';
 const actualArrival=stop?t.actualArrival:destinationArrival(f,t);
 const arrival=`<td class="board-arrival"><span class="board-mobile-label">${tr("Прилет UTC")}</span>`+
  (stop?'':`<span>${tr("План")} <time>`+clock(t.scheduledArrival)+'</time></span>')+
  '<span'+(!stop&&actualArrival>t.scheduledArrival?' class="late"':'')+`>${tr(stop?"Посадка":"Факт")} <time>`+clock(actualArrival)+'</time></span></td>';
 const status=stop?'<span class="badge diverted">'+tr('Уход на запасной')+'</span>':statusBadge(f)+delayBadge(f);
 const color=stop?'diverted':arrivalDelay(f)>0?'arrival-late':statusColors[journalStatus(f)]||'';
 return '<tr class="'+color+(kind==='continuation'?' board-continuation':'')+'">'+
 '<td>'+time+(date!==groupDate?'<small>'+displayDate(date)+'</small>':'')+'</td>'+
 place(f.dep,tr("Отправление"))+place(stop?alternate(f):f.arr,tr("Назначение"),stop?f.arr:'')+arrival+
 '<td><strong>'+flightNumber(f)+'</strong> '+demoBadge(f)+'<small class="flight-kind">'+tr(kind==='continuation'?'Продолжение рейса':flightType(f))+'</small></td>'+
 '<td class="board-aircraft"><span class="aircraft-model">'+esc(aircraftModel(aircraftFor(f.tail)))+'</span><small>'+esc(f.tail)+'</small></td><td><div class="flight-badges">'+status+'</div>'+(f.goArounds?`<small>${tr("Уходов на второй круг:")} `+esc(f.goArounds)+'</small>':'')+'</td>'+
 '<td><button data-flight="'+esc(f.id)+'"'+(kind==='continuation'?' data-show-continuation':'')+' aria-label="'+tr('Открыть рейс')+' '+flightNumber(f)+'">→</button></td></tr>';
}

function boardRows() {
 const needle=journalQuery.trim().toLocaleLowerCase('ru').replace(/\s+/g,'');
 const matching=data.flights.filter(f=>{
  const codes=[f.dep,alternate(f),f.arr];
  const terms=[f.number,f.tail,...codes.flatMap(c=>[c,airport(c)?.iata,airportInfo(c)?.cityRu,airportInfo(c)?.cityEn])];
  return terms.join(' ').toLocaleLowerCase('ru').replace(/\s+/g,'').includes(needle) &&
   (journalFilter==='all'||f.tail===journalFilter) &&
   (typeFilter==='all'||typeFilter===flightType(f)) &&
   (statusFilter==='all'||statusFilter===journalStatus(f)||
    statusFilter===continuationLeg(f)?.status||
    statusFilter==='Уход на запасной'&&isDiversion(f)||statusFilter==='arrival'&&arrivalDelay(f)>0);
 });
 const blocks=matching.map(f=>{
  const next=continuationLeg(f);
  const legs=[[f,isDiversion(f)&&alternate(f)?'diverted':'']];
  if(next)legs.push([next,'continuation']);
  const rows=legs.map(([flight,kind])=>{
   const {actualDeparture,scheduledDeparture}=flightTimes(flight);
   const departure=Number.isFinite(actualDeparture)?actualDeparture:scheduledDeparture;
   const date=Number.isFinite(departure)?new Date(departure).toISOString().slice(0,10):flight.date;
   return {flight,kind,date,departure};
  }).reverse();
  const latest=rows.find(row=>!journalDate||row.date===journalDate);
  return latest&&{rows,date:latest.date,departure:latest.departure};
 }).filter(Boolean)
  .sort((a,b)=>b.date.localeCompare(a.date)||(b.departure||0)-(a.departure||0));
 if (!blocks.length) return `<p class="empty muted">${tr("Рейсы не найдены.")}</p>`;
 const groups=new Map();
 for (const block of blocks) {
  if (!groups.has(block.date)) groups.set(block.date,[]);
  groups.get(block.date).push(block);
 }
 return [...groups].map(([date,items])=>'<div class="board-group"><table class="journal-table flight-board">'+
 '<caption>'+displayDate(date)+'</caption><colgroup><col><col><col><col><col><col><col><col></colgroup>'+
 `<thead><tr><th>${tr("Вылет UTC")}</th><th>${tr("Отправление")}</th><th>${tr("Назначение")}</th><th>${tr("Прилет UTC")}</th><th>${tr("Рейс")}</th><th>${tr("Борт")}</th><th>${tr("Статус")}</th><th></th></tr></thead>`+
 items.map(({rows})=>(rows.length>1?`<tbody class="board-linked" aria-label="${tr('Два участка одного рейса')}">`:'<tbody>')+
 rows.map(row=>boardRow(row.flight,row.kind,row.date,date)).join('')+'</tbody>').join('')+'</table></div>').join('');
}

let journalQuery='', journalDate='', typeFilter='all';
function journal() {
 return '<section class="panel board-panel"><div class="controls board-filters">'+
 `<input id="journalSearch" type="search" aria-label="${tr("Поиск рейсов")}" placeholder="${tr("Поиск рейса")}" value="`+esc(journalQuery)+'">'+
 '<div class="board-date"><button id="journalDate" type="button" class="board-date-field" data-action="journal-calendar" aria-haspopup="dialog" aria-expanded="false"><span>'+
 (journalDate?displayDate(journalDate):tr("Все даты"))+'</span>'+toolbarIcon('calendar')+'</button>'+
 (journalDate?`<button type="button" data-action="clear-journal-date" aria-label="${tr("Сбросить дату")}">×</button>`:'')+'</div>'+
 `<select id="typeFilter" aria-label="${tr("Тип рейса")}">`+option('all',tr("Все типы"),typeFilter)+[...flightTypes,'Не указан'].map(t=>option(t,tr(t),typeFilter)).join('')+'</select>'+
 `<select id="journalFilter" aria-label="${tr("Борт")}">`+option('all',tr("Все борта"),journalFilter)+fleet.map(a=>option(a.tail,aircraftModel(a)+' · '+a.tail,journalFilter)).join('')+'</select>'+
 `<select id="statusFilter" aria-label="${tr("Статус")}">`+option('all',tr("Все статусы"),statusFilter)+option('arrival',tr("Позднее прибытие"),statusFilter)+statuses.map(s=>option(s,tr(s),statusFilter)).join('')+'</select></div>'+
 '<div id="boardRows">'+boardRows()+'</div></section>';
}
