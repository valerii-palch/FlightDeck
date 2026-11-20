const flightTypes = ['Регулярный','Чартерный','Перегоночный'];
const flightType = f => flightTypes.includes(f.type) ? f.type : 'Не указан';
const alternate = f => f.diversionAirport || f.note?.match(/Запасной аэропорт\s+([A-Z]{4})/i)?.[1]?.toUpperCase() || '';
const isDiversion = f => f.status==='Уход на запасной';
const continuationLeg = f => isDiversion(f)&&f.continuation
 ? {...f.continuation,dep:alternate(f),arr:f.arr,number:f.number,tail:f.tail,type:f.type} : null;
const legFlown = leg => leg.status!=='Отменен' && (!!leg.ata || leg.status==='Выполнен' || (isDiversion(leg)&&Number.isFinite(leg.actualMinutes)));
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
 return `<section class="panel facts"><h2>${tr("Уход на запасной")}</h2>`+
 '<p>'+codeLabel(f.dep)+' → '+(destination?codeLabel(destination):tr("Запасной не указан"))+` <span class="muted">· ${tr("Посадка")} `+landing+'</span></p>'+
 (next?'<div class="strip"><p>'+codeLabel(next.dep)+' → '+codeLabel(next.arr)+' · '+flightNumber(next)+'</p>'+
 '<p class="muted">'+displayDate(next.date)+' · '+esc(next.std)+' → '+esc(next.sta)+' UTC · '+esc(tr(journalStatus(next)))+'</p>'+
 (next.atd||next.ata?`<p>${tr("Факт:")} `+stampLabel(flightTimes(next).actualDeparture,next.date)+' → '+stampLabel(flightTimes(next).actualArrival,next.date)+' '+delayBadge(f)+'</p>':'')+'</div>':'')+
 '<button class="facts" data-action="'+(destination?'continuation':'divert')+'">'+(next?tr("Изменить продолжение"):destination?tr("Добавить продолжение"):tr("Указать запасной"))+'</button></section>';
}

function editContinuation(f) {
 const inbound=flightTimes(f).actualArrival;
 const next=continuationLeg(f);
 const date=Number.isFinite(inbound)?new Date(inbound).toISOString().slice(0,10):f.date;
 const leg=next||{date,status:'Запланирован'};
 const field=(key,label,type,required=false)=>'<label>'+label+(type==='date'?dateField(key,leg[key],required):type==='time'?timeField(key,leg[key],required):'<input name="'+key+'" type="'+type+'" value="'+esc(leg[key])+'" '+(required?'required':'')+'>')+'</label>';
 const allowed=['Запланирован','Задержан','Вылетел','Выполнен','Отменен'];
 openDialog(`<h2>${tr("Продолжение ·")} `+flightNumber(f)+'</h2><p>'+codeLabel(alternate(f))+' → '+codeLabel(f.arr)+'</p>'+
 '<form id="continuationForm" class="editor two facts">'+field('date',tr("Дата вылета по плану UTC"),'date',true)+
 `<label>${tr("Статус")}<select name="status">`+allowed.map(s=>option(s,tr(s),leg.status)).join('')+'</select></label>'+
 field('std',tr("Вылет по плану UTC"),'time',true)+field('sta',tr("Прилет по плану UTC"),'time',true)+
 field('atd',tr("Вылет фактически UTC"),'time')+field('ata',tr("Прилет фактически UTC"),'time')+
 field('atdDate',tr("Дата фактического вылета UTC"),'date')+field('ataDate',tr("Дата фактического прилета UTC"),'date')+
 `<label>${tr("Время полета, мин")}<input name="actualMinutes" type="number" min="0" max="1440" value="`+esc(leg.actualMinutes)+'"></label>'+
 `<label class="full">${tr("Примечание")}<textarea name="note" rows="2">`+esc(leg.note)+'</textarea></label>'+
 `<div class="full controls"><button class="primary">${tr("Сохранить")}</button><button type="button" data-action="close">${tr("Отмена")}</button>`+
 (next?`<button type="button" id="removeContinuation">${tr("Удалить продолжение")}</button>`:'')+'</div></form>');
 const form=byId('continuationForm');
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
  values.actualMinutes=values.actualMinutes===''?null:Number(values.actualMinutes);
  const times=flightTimes(values);
  let error='';
  let key='ata';
  if (values.status==='Выполнен'&&!values.ata) error=tr("Укажи фактическое время прилета.");
  if (times.actualArrival<times.actualDeparture) error=tr("Прилет должен быть после вылета.");
  if (Number.isFinite(inbound)&&times.actualDeparture<inbound) {
   error=tr("Продолжение вылетает после посадки на запасном. Проверь дату и время UTC.");
   key='atd';
  }
  if (Number.isFinite(inbound)&&times.actualArrival<inbound) error=tr("Прибытие должно быть после посадки на запасном.");
  if (error) {form.elements[key].setCustomValidity(error);form.reportValidity();return;}
  f.continuation={...f.continuation,...values};
  save();byId('dialog').close();render();
 };
}

function boardRow(f) {
 const t=flightTimes(f);
 const city=code=>esc(airportCity(code));
 const next=continuationLeg(f);
 const place=(code,label)=>'<td class="board-place"><span class="board-mobile-label">'+label+'</span><strong class="board-city">'+city(code)+'</strong><span class="board-route">'+codeLabel(code)+'</span></td>';
 const via=isDiversion(f)&&alternate(f)?`<small>${tr("Через")} `+city(alternate(f))+' · '+codeLabel(alternate(f))+'</small>':'';
 const changed=Number.isFinite(t.actualDeparture)&&t.actualDeparture!==t.scheduledDeparture;
 const time='<span class="board-time">'+(changed?'<del>'+esc(f.std)+'</del><strong>'+formatTime(t.actualDeparture,f.date)+'</strong>':'<strong>'+esc(f.std)+'</strong>')+'</span>';
 const actualArrival=destinationArrival(f,t);
 const clock=stamp=>Number.isFinite(stamp)?formatTime(stamp,f.date):'—';
 const arrival=`<td class="board-arrival"><span class="board-mobile-label">${tr("Прилет UTC")}</span>`+
  `<span>${tr("План")} <time>`+clock(t.scheduledArrival)+'</time></span>'+
  '<span'+(actualArrival>t.scheduledArrival?' class="late"':'')+`>${tr("Факт")} <time>`+clock(actualArrival)+'</time></span></td>';
 const status=statusBadge(f)+via+(isDiversion(f)&&next?`<small>${tr("Уход на запасной ·")} `+esc(tr(journalStatus(next)))+'</small>':'')+delayBadge(f);
 return '<tr class="'+(arrivalDelay(f)>0?'arrival-late':statusColors[journalStatus(f)]||'')+'">'+
 '<td>'+time+'</td>'+place(f.dep,tr("Отправление"))+place(f.arr,tr("Назначение"))+arrival+
 '<td><strong>'+flightNumber(f)+'</strong> '+demoBadge(f)+'<small class="flight-kind">'+tr(flightType(f))+'</small></td>'+
 '<td class="board-aircraft"><span class="aircraft-model">'+esc(aircraftModel(aircraftFor(f.tail)))+'</span><small>'+esc(f.tail)+'</small></td><td><div class="flight-badges">'+status+'</div>'+(f.goArounds?`<small>${tr("Уходов на второй круг:")} `+esc(f.goArounds)+'</small>':'')+'</td>'+
 '<td><button data-flight="'+esc(f.id)+'" aria-label="'+tr('Открыть рейс')+' '+flightNumber(f)+'">→</button></td></tr>';
}

function boardRows() {
 const needle=journalQuery.trim().toLocaleLowerCase('ru').replace(/\s+/g,'');
 const rows=newest(data.flights.filter(f=>{
  const codes=[f.dep,alternate(f),f.arr];
  const terms=[f.number,f.tail,...codes.flatMap(c=>[c,airport(c)?.iata,airportInfo(c)?.cityRu,airportInfo(c)?.cityEn])];
  return terms.join(' ').toLocaleLowerCase('ru').replace(/\s+/g,'').includes(needle) &&
   (journalFilter==='all'||f.tail===journalFilter) &&
   (typeFilter==='all'||typeFilter===flightType(f)) &&
   (!journalDate||f.date===journalDate) &&
   (statusFilter==='all'||statusFilter===journalStatus(f)||
    statusFilter==='Уход на запасной'&&isDiversion(f)||statusFilter==='arrival'&&arrivalDelay(f)>0);
 }));
 if (!rows.length) return `<p class="empty muted">${tr("Рейсы не найдены.")}</p>`;
 const groups=new Map();
 for (const row of rows) {
  if (!groups.has(row.date)) groups.set(row.date,[]);
  groups.get(row.date).push(row);
 }
 return [...groups].map(([date,items])=>'<div class="table-wrap"><table class="journal-table flight-board">'+
 '<caption>'+displayDate(date)+'</caption><colgroup><col><col><col><col><col><col><col><col></colgroup>'+
 `<thead><tr><th>${tr("Вылет UTC")}</th><th>${tr("Отправление")}</th><th>${tr("Назначение")}</th><th>${tr("Прилет UTC")}</th><th>${tr("Рейс")}</th><th>${tr("Борт")}</th><th>${tr("Статус")}</th><th></th></tr></thead><tbody>`+
 items.map(boardRow).join('')+'</tbody></table></div>').join('');
}

let journalQuery='', journalDate='', typeFilter='all';
function journal() {
 return '<section class="panel board-panel '+(preferences().density==='compact'?'board-compact':'')+'"><div class="controls board-filters">'+
 `<input id="journalSearch" type="search" aria-label="${tr("Поиск рейсов")}" placeholder="${tr("Поиск рейса")}" value="`+esc(journalQuery)+'">'+
 '<div class="board-date"><label class="board-date-field"><span aria-hidden="true">'+(journalDate?displayDate(journalDate):tr("Все даты"))+`</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 3v5m8-5v5M4 10h16"/></svg><input id="journalDate" type="date" aria-label="${tr("Дата вылета UTC")}" value="`+esc(journalDate)+'"></label>'+
 (journalDate?`<button type="button" data-action="clear-journal-date" aria-label="${tr("Сбросить дату")}">×</button>`:'')+'</div>'+
 `<select id="typeFilter" aria-label="${tr("Тип рейса")}">`+option('all',tr("Все типы"),typeFilter)+[...flightTypes,'Не указан'].map(t=>option(t,tr(t),typeFilter)).join('')+'</select>'+
 `<select id="journalFilter" aria-label="${tr("Борт")}">`+option('all',tr("Все борта"),journalFilter)+fleet.map(a=>option(a.tail,aircraftModel(a)+' · '+a.tail,journalFilter)).join('')+'</select>'+
 `<select id="statusFilter" aria-label="${tr("Статус")}">`+option('all',tr("Все статусы"),statusFilter)+option('arrival',tr("Позднее прибытие"),statusFilter)+statuses.map(s=>option(s,tr(s),statusFilter)).join('')+'</select></div>'+
 '<div id="boardRows">'+boardRows()+'</div></section>';
}
