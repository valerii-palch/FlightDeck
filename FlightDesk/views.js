const planeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22 12c0-1.1-.9-2-2-2h-4.7L9 2H7l3.5 8H6L3 7H1l1.5 5L1 17h2l3-3h4.5L7 22h2l6.3-8H20c1.1 0 2-.9 2-2Z"/></svg>';
const statusColors = {
 'Выполнен':'complete', 'Отменен':'cancelled', 'Уход на запасной':'diverted', 'Задержан':'late',
 'Запланирован':'scheduled', 'Подготовка':'progress', 'Идет посадка':'progress', 'Посадка завершена':'progress', 'Вылетел':'progress'
};
const day = 86400000;
function flightTimes(f) {
 const scheduledDeparture = clockOn(f.date,f.std);
 let scheduledArrival = clockOn(f.date,f.sta);
 if (scheduledArrival < scheduledDeparture) scheduledArrival += day;
 let actualDeparture = clockOn(f.atdDate || f.date,f.atd);
 if (!f.atdDate && Math.abs(actualDeparture-scheduledDeparture)>day/2)
  actualDeparture += actualDeparture<scheduledDeparture ? day : -day;
 let actualArrival = clockOn(f.ataDate || f.date,f.ata);
 if (!f.ataDate && Number.isFinite(actualArrival)) {
  if (Number.isFinite(actualDeparture)) {
   while (actualArrival < actualDeparture) actualArrival += day;
   while (actualArrival - actualDeparture >= day) actualArrival -= day;
  } else if (Number.isFinite(scheduledArrival)) {
   actualArrival += Math.round((scheduledArrival-actualArrival)/day)*day;
  }
 }
 return {scheduledDeparture,scheduledArrival,actualDeparture,actualArrival};
}
function setFlightStatus(f,status,now=Date.now()) {
 if(f.status===status)return true;
 const mark=status==='Вылетел'&&!f.atd?'atd':status==='Выполнен'&&!f.ata?'ata':null;
 if(mark){
  const stamp=new Date(now).toISOString();
  const fieldDate=mark+'Date';
  const candidate={...f,[mark]:stamp.slice(11,16),[fieldDate]:stamp.slice(0,10)};
  const {actualDeparture,actualArrival}=flightTimes(candidate);
  if(actualArrival<actualDeparture)return false;
  f[mark]=candidate[mark];
  f[fieldDate]=candidate[fieldDate];
 }
 f.status=status;
 return true;
}
function changeFlightStatus(f,status){
 if(!setFlightStatus(f,status)){
  notice(tr("Прилет должен быть после вылета."));
  return;
 }
 save();
 render();
}
const stampLabel = (value,date) => Number.isFinite(value)?formatTime(value,date)+' UTC':'—';
function destinationArrival(f,times=flightTimes(f)) {
 if(f.status==='Отменен') return NaN;
 if(!isDiversion(f)) return times.actualArrival;
 const next=continuationLeg(f);
 return next&&next.status!=='Отменен'?flightTimes(next).actualArrival:NaN;
}
function arrivalDelay(f) {
 const times=flightTimes(f);
 return Math.round((destinationArrival(f,times)-times.scheduledArrival)/minute);
}
function delayBadge(f) {
 const difference=arrivalDelay(f);
 if(!difference) return '';
 const minutes=Math.abs(difference);
 if(appLanguage()==='en'){
  const unit=minutes===1?'minute':'minutes';
  return '<span class="badge '+(difference>0?'late':'good')+'">'+minutes+' '+unit+(difference>0?' late':' early')+'</span>';
 }
 const unit={one:'минуту',few:'минуты',many:'минут'}[new Intl.PluralRules('ru').select(minutes)]||'минут';
 return '<span class="badge '+(difference>0?'late':'good')+'">'+(difference>0?'Задержка на ':'Раньше на ')+minutes+' '+unit+'</span>';
}
function journalStatus(f) {
 if (f.status==='Отменен') return f.status;
 if (isDiversion(f)) {
  const next=continuationLeg(f);
  return next&&legFlown(next)?'Выполнен':f.status;
 }
 return f.ata ? 'Выполнен' : f.status;
}
const statusBadge = f => '<span class="badge '+(statusColors[journalStatus(f)]||'scheduled')+'">'+esc(tr(journalStatus(f)))+'</span>';
const demoBadge=f=>f.demo?`<span class="badge demo-badge">${tr("Демо")}</span>`:'';
const flightNumber = f => esc(f.number || tr("Без номера"));
function flightTable(rows) {
 return `<div class="table-wrap"><table class="journal-table flight-summary-table"><thead><tr><th>${tr("Дата UTC")}</th><th>${tr("Рейс")}</th><th>${tr("Борт")}</th><th>${tr("Маршрут")}</th><th>${tr("Статус")}</th><th></th></tr></thead><tbody>`+
 rows.map(f=>'<tr class="'+(arrivalDelay(f)>0?'arrival-late':statusColors[journalStatus(f)]||'')+'"><td>'+displayDate(f.date)+'</td><td>'+flightNumber(f)+' '+demoBadge(f)+'</td><td class="board-aircraft"><span class="aircraft-model">'+esc(aircraftModel(aircraftFor(f.tail)))+'</span><small>'+esc(f.tail)+'</small></td><td><div class="codes">'+codeLabel(f.dep)+' <span>→</span> '+codeLabel(f.arr)+'</div></td><td><div class="flight-badges">'+statusBadge(f)+delayBadge(f)+'</div></td><td><button data-flight="'+esc(f.id)+`">${tr("Открыть")}</button></td></tr>`).join('')+'</tbody></table></div>';
}
const flown = f => isDiversion(f) ? !!continuationLeg(f)&&legFlown(continuationLeg(f)) : legFlown(f);
function loggedMinutes(f) {
 if (Number.isFinite(f.actualMinutes) && f.actualMinutes>=0) return f.actualMinutes;
 const t = flightTimes(f);
 const elapsed = Math.round((t.actualArrival-t.actualDeparture)/minute);
 return Number.isFinite(elapsed) && elapsed>=0 ? elapsed : 0;
}
function flightStats(rows) {
 const completed = rows.filter(flown);
 return {count:completed.length, minutes:rows.flatMap(physicalLegs).filter(legFlown).reduce((sum,f)=>sum+loggedMinutes(f),0)};
}
const newest = rows => [...rows].sort((a,b)=>(b.date+b.std).localeCompare(a.date+a.std));
const activeFlight = rows => newest(rows.filter(f=>!flown(f)&&['Подготовка','Идет посадка','Посадка завершена','Вылетел','Уход на запасной'].includes(f.status)))[0];
function workingFlight(rows, now=Date.now()) {
 return activeFlight(rows)||newest(rows.filter(f=>(f.status==='Запланирован'||f.status==='Задержан')&&!flown(f)&&clockOn(f.date,f.std)>=now)).at(-1);
}
const nextStatus = {
 'Запланирован':'Подготовка','Задержан':'Подготовка','Подготовка':'Идет посадка',
 'Идет посадка':'Посадка завершена','Посадка завершена':'Вылетел','Вылетел':'Выполнен'
};
function nextFlightButton(f) {
 const next=nextStatus[f.status];
 return next&&workingFlight(summaryFlights())?.id===f.id
  ? '<button class="flight-next" data-next-flight="'+esc(f.id)+'">'+tr('Следующий статус')+' · '+tr(next)+'</button>' : '';
}
function advanceFlight(id) {
 const f=workingFlight(summaryFlights());
 const next=f&&nextStatus[f.status];
 if(!next||id!==f.id)return;
 changeFlightStatus(f,next);
}
const aircraftImage = a => '<div class="aircraft-art '+a.short.toLowerCase()+'" role="img" aria-label="'+tr('Иллюстрация')+' '+a.type+` ${tr("в ливрее Аэрофлота")}"></div>`;
const metric = (label,value) => '<div class="metric"><small>'+label+'</small><strong>'+value+'</strong></div>';
function home() {
 const rows=summaryFlights();
 const stats=flightStats(rows);
 const recent=newest(rows).slice(0,6), working=workingFlight(rows), latest=working||recent[0];
 const name=preferences().profileName.trim().split(/\s+/)[0];
 const city=code=>esc(airportCity(code));
 return `<header class="dashboard-heading"><div><h1>${tr("Главная")}</h1>`+(name?`<p class="muted">${tr("Привет,")} ${esc(name)}!</p>`:'')+`</div><button class="primary" data-action="new">＋ ${tr("Добавить рейс")}</button></header>`+
 '<div class="dashboard-grid"><section class="panel dashboard-card dashboard-latest"><h2>'+(working?(['Запланирован','Задержан'].includes(working.status)?tr("Ближайший рейс"):tr("Рейс в работе")):tr("Последний рейс"))+'</h2>'+
 (latest?'<p class="dashboard-number">'+flightNumber(latest)+'</p><div class="dashboard-route"><div>'+codeLabel(latest.dep)+'<small title="'+city(latest.dep)+'">'+city(latest.dep)+'</small></div>'+planeIcon+'<div>'+codeLabel(latest.arr)+'<small title="'+city(latest.arr)+'">'+city(latest.arr)+'</small></div></div>'+
 '<p class="latest-meta muted"><span>'+esc(aircraftModel(aircraftFor(latest.tail)))+'</span><small>'+esc(latest.tail)+'</small><time>'+displayDate(latest.date)+'</time></p><div class="flight-badges">'+statusBadge(latest)+delayBadge(latest)+'</div><button class="flight-open" data-flight="'+esc(latest.id)+'">'+`${tr("Открыть данные рейса")}</button>`+nextFlightButton(latest):`<p class="muted">${tr("Журнал пуст")}</p>`)+
 '</section>'+
 `<section class="panel dashboard-card"><h2>${tr("Активность")}</h2><p class="muted">${tr("Последние 30 дней UTC")}</p>`+dashboardActivity()+
 '<p>'+stats.count+` ${tr("выполнено ·")} `+duration(stats.minutes)+`</p><button data-page="journal">${tr("Журнал полетов")}</button></section>`+
 `<section class="panel dashboard-card"><h2>${tr("Флот")}</h2>`+fleet.map(a=>{
  const count=flightStats(rows.filter(f=>f.tail===a.tail)).count;
  return '<div class="dashboard-aircraft"><span>'+aircraftModel(a)+' <small>'+a.tail+'</small></span><strong>'+count+'</strong></div>';
 }).join('')+`<button data-page="fleet">${tr("Открыть флот")}</button></section>`+
 `<section class="panel dashboard-card"><h2>${tr("Аэропорты")}</h2><p class="dashboard-number">`+data.airports.filter(a=>a.scenery).length+' <small>/ '+data.airports.length+'</small></p>'+
 `<p class="muted">${tr("Установлено сценариев")}</p><button data-page="airports">${tr("Каталог аэропортов")}</button></section></div>`+
 `<section class="panel facts"><div class="row"><h2>${tr("Недавние рейсы")}</h2><button data-page="journal">${tr("Весь журнал")}</button></div>`+
 (recent.length?flightTable(recent):`<p class="muted">${tr("Рейсов пока нет.")}</p>`)+'</section>'+routeMap();
}
let fleetSlide = 0;
function fleetPage() {
 const a = fleet[fleetSlide];
 const stats = flightStats(data.flights.filter(f=>f.tail===a.tail));
 const previous = (fleetSlide+fleet.length-1)%fleet.length;
 const next = (fleetSlide+1)%fleet.length;
 return `<section class="fleet-carousel" aria-roledescription="${tr("карусель")}" aria-label="${tr("Борта флота")}">`+
 '<div class="fleet-groups">'+[[tr("Ближнемагистральные"),[0]],[tr("Дальнемагистральные"),[1,2]]].map(([title,items])=>
 '<div class="fleet-group"><small>'+title+'</small><div class="fleet-tabs">'+items.map(i=>'<button data-slide="'+i+'" data-slide-focus="tab" aria-pressed="'+(i===fleetSlide)+'" class="'+(i===fleetSlide?'active':'')+'">'+aircraftModel(fleet[i])+'</button>').join('')+'</div></div>').join('')+'</div>'+
 '<article class="panel fleet-slide" aria-label="'+a.type+' · '+(fleetSlide+1)+` ${tr("из")} `+fleet.length+'">'+aircraftImage(a)+
 '<div class="fleet-slide-body"><div><h2>'+a.type+'</h2><p class="muted">'+tr(a.name)+' · '+a.tail+'</p></div>'+
 '<div class="fleet-metrics">'+metric(tr("Мест на борту"),capacity(a))+metric(tr("Налет"),duration(stats.minutes))+'</div>'+
 '<div class="fleet-slide-actions"><button class="primary" data-aircraft="'+a.tail+`">${tr("Открыть борт")}</button>`+
 '<div class="fleet-controls"><button data-slide="'+previous+`" data-slide-focus="previous" aria-label="${tr("Предыдущий борт")}">←</button>`+
 '<small class="muted">'+(fleetSlide+1)+' / '+fleet.length+'</small><button data-slide="'+next+`" data-slide-focus="next" aria-label="${tr("Следующий борт")}">→</button></div></div></div></article></section>`;
}
function aircraftPage() {
 const a = fleet.find(a=>a.tail===detailTail);
 const rows = newest(data.flights.filter(f=>f.tail===a.tail));
 const stats = flightStats(rows);
 return `<div class="controls page-actions"><button data-page="fleet">← ${tr("К флоту")}</button><button data-tail="`+a.tail+`">${tr("Полетный центр борта")}</button></div>`+
 '<div class="grid two"><section class="panel"><h2>'+a.type+'</h2><p class="muted">'+tr(a.name)+' · '+a.tail+'</p>'+aircraftImage(a)+`<div class="strip row"><span>${tr("Выполнено перелетов")}</span><strong>`+stats.count+`</strong></div><div class="strip row"><span>${tr("Налет по журналу")}</span><strong>`+duration(stats.minutes)+'</strong></div></section>'+
 `<section class="panel"><h2>${tr("Пассажирский салон")}</h2><div class="strip row"><span>${tr("Всего мест")}</span><strong>`+capacity(a)+'</strong></div>'+
 a.seats.map((n,i)=>'<div class="strip row"><span>'+[tr("Эконом"),tr("Комфорт"),tr("Бизнес")][i]+'</span><strong>'+(n||'—')+'</strong></div>').join('')+
 (a.short==='B777'?`<p class="facts muted">${tr("Стоянки по списку Airbus A350")}</p>`:'')+'</section></div>'+
 `<section class="panel facts"><h2>${tr("Рейсы борта")}</h2>`+(rows.length?flightTable(rows):`<p class="muted">${tr("Рейсов пока нет.")}</p>`)+'</section>';
}
function pilot() {
 const rows=summaryFlights();
 const stats = flightStats(rows);
 const completed = rows.filter(flown);
 const cutoff = days => new Date(Date.now()-days*day).toISOString().slice(0,10);
 const recent = days => flightStats(rows.filter(f=>f.date>=cutoff(days)&&f.date<=dateUTC()));
 const landings = rows.flatMap(physicalLegs).filter(f=>legFlown(f)&&f.ata).length;
 const routes = completed.filter(f=>airport(f.dep)&&airport(f.arr));
 const domestic = routes.filter(f=>isDomestic(airport(f.dep))&&isDomestic(airport(f.arr))).length;
 const international = routes.filter(f=>airport(f.dep).country!==airport(f.arr).country).length;
 const name=preferences().profileName;
 return `<section class="panel welcome"><div class="eyebrow">${tr("Летная книжка · симулятор")}</div><div class="row"><h2>${esc(name||tr('Летная книжка'))}</h2><div class="controls"><button data-action="profile-name">${tr(name?'Изменить имя':'Указать имя')}</button>${demoWorkspace?'':`<button data-action="reset-profile">${tr('Сбросить рейсы и профиль')}</button>`}</div></div><p class="muted">${tr("Налет и перелеты по записям журнала")}</p></section>`+cloudProfilePanel()+
 '<div class="profile-metrics facts">'+metric(tr("Общее время"),duration(stats.minutes))+metric(tr("Выполнено перелетов"),stats.count)+metric(tr("Посадки по факту прибытия"),landings)+metric(tr("Посещено стран и территорий"),travelAchievements(rows).countries.size)+'</div>'+
 `<div class="grid two facts"><section class="panel"><h2>${tr("Налет по типам")}</h2>`+
 fleet.map(a=>{const part=flightStats(rows.filter(f=>f.tail===a.tail));return '<div class="strip row"><span>'+a.type+'</span><strong>'+duration(part.minutes)+' · '+part.count+` ${tr("перел.")}</strong></div>`;}).join('')+'</section>'+
 `<section class="panel"><h2>${tr("Активность")}</h2>`+[30,90].map(days=>{const part=recent(days);return `<div class="strip row"><span>${tr("За")} `+days+` ${tr("дней UTC")}</span><strong>`+duration(part.minutes)+' · '+part.count+` ${tr("перел.")}</strong></div>`;}).join('')+
 `<div class="strip row"><span>${tr("Внутренние перелеты")}</span><strong>`+domestic+'</strong></div>'+
 `<div class="strip row"><span>${tr("Международные перелеты")}</span><strong>`+international+'</strong></div>'+
 `<p class="facts muted">${tr("При отсутствии записанного времени используется интервал между фактическим вылетом и прилетом.")}</p></section></div>`+routeMap()+achievementPanel();
}
