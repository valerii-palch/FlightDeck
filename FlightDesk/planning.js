function medianMinutes(values) {
 const sorted=[...values].sort((a,b)=>a-b), mid=Math.floor(sorted.length/2);
 return Math.round(sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2);
}
function routeDurationEstimate(dep, arr, aircraftTail, excludeID) {
 const type=aircraftFor(aircraftTail)?.short;
 const samples=data.flights.filter(f=>!f.demo&&f.id!==excludeID).flatMap(physicalLegs)
  .filter(f=>f.dep===dep&&f.arr===arr&&f.status!=='Отменен'&&!isDiversion(f)&&legFlown(f))
  .map(f=>{const t=flightTimes(f);return {
   minutes:actualFlightMinutes(f,t)??f.actualMinutes,
   type:aircraftFor(f.tail)?.short
  };}).filter(s=>Number.isFinite(s.minutes)&&s.minutes>0&&s.minutes<1440);
 const matching=samples.filter(s=>s.type===type);
 const values=(matching.length?matching:samples).map(s=>s.minutes);
 return values.length?{minutes:medianMinutes(values),average:Math.round(values.reduce((sum,value)=>sum+value,0)/values.length),count:values.length,source:'journal'}:null;
}
function bindDurationEstimate(form) {
 const fields=form.elements, output=byId('durationEstimate'), source=byId('durationSource');
 let controller,timer,lastRoute;
 function update(){
  const dep=fields.dep.value,arr=fields.arr.value;
  const route=[dep,arr,fields.tail.value].join('/');
  if(route===lastRoute)return;
  lastRoute=route;
  controller?.abort();clearTimeout(timer);
  const show=estimate=>{
   output.textContent=estimate?duration(estimate.average??estimate.minutes):'—';
   source.textContent=estimate?tr(estimate.source==='journal'?'По журналу':'Реальные рейсы')+' · '+estimate.count:'';
  };
  const local=routeDurationEstimate(dep,arr,fields.tail.value);
  show(local);
  if(local||!airport(dep)||!airport(arr)||dep===arr)return;
  timer=setTimeout(async()=>{
   const request=new AbortController();
   controller=request;
   try {
    const result=await lookupRealRoute(dep,arr,AbortSignal.any([request.signal,AbortSignal.timeout(20000)]));
    if(!request.signal.aborted&&form.isConnected&&route===lastRoute&&
     Number.isFinite(result.minutes)&&result.minutes>0&&result.minutes<1440&&Number.isInteger(result.count)&&result.count>0)
     show({...result,source:'real'});
   }catch {}
  },600);
 }
 form.addEventListener('input',update);
 byId('dialog').addEventListener('close',()=>{controller?.abort();clearTimeout(timer);},{once:true});
 update();
}

const plannerStatuses=[
 ['Запланирован','Запланирован'],['Подготовка','Заправка'],['Загрузка багажа','Загрузка багажа','Baggage loading'],
 ['Идет посадка','Посадка','Boarding'],['Посадка завершена','Посадка окончена'],['Вылетел','Вылетел'],['Выполнен','Выполнен']
];
const plannedFlightNumber=(code,number)=>[code,number].filter(Boolean).join(' ');
function bindAirline(form){
 const {flightCode,airline}=form.elements;
 const directory=JSON.parse(byId('airline-codes').textContent);
 let previous=flightCode.value;
 const update=()=>{
  if(previous===flightCode.value)return;
  previous=flightCode.value;
  airline.value=previous==='AFL'&&appLanguage()==='ru'?'Аэрофлот':directory[previous]??'';
 };
 flightCode.addEventListener('input',event=>{if(!event.isComposing)update();});
 flightCode.addEventListener('compositionend',update);
}

const datePlus=(date,days)=>new Date(clockOn(date,'00:00')+days*day).toISOString().slice(0,10);
function defaultArrivalDate(date,std,sta){
 return date&&std&&sta&&sta<std?datePlus(date,1):date;
}
function validateSchedule(form,{date,std,sta,staDate}){
 if(clockOn(staDate||defaultArrivalDate(date,std,sta),sta)>=clockOn(date,std))return true;
 const field=form.elements.staDate??form.elements.sta;
 field.setCustomValidity(tr('Прилет должен быть после вылета.'));
 field.reportValidity();
 return false;
}

const localDateFormatters=new Map();
function airportLocalStamp(code,stamp){
 const zone=airportInfo(code)?.timezone;
 if(!Number.isFinite(stamp)||!validAirportTimezone(zone))return '';
 if(!localDateFormatters.has(zone)){
  localDateFormatters.set(zone,new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
 }
 const parts=Object.fromEntries(localDateFormatters.get(zone).formatToParts(stamp).map(({type,value})=>[type,value]));
 return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
}

function localToUTC(code,date,time,reference=NaN){
 const wall=clockOn(date,time);
 const expected=date+'T'+time;
 const candidates=new Set();
 for(const delta of [-day,0,day]){
  const sample=wall+delta, local=airportLocalStamp(code,sample);
  if(!local)continue;
  const candidate=wall+sample-Date.parse(local+':00Z');
  if(airportLocalStamp(code,candidate)===expected)candidates.add(candidate);
 }
 return [...candidates].sort((a,b)=>Number.isFinite(reference)?Math.abs(a-reference)-Math.abs(b-reference)||a-b:a-b);
}

function bindRouteTimes(form,explicitArrivalDate){
 const fields=form.elements;
 const dateOf=key=>parseDisplayDate(fields[key].value.trim());
 const timeOf=key=>parseFlightTime(fields[key].value);
 const utc=(date,time)=>clockOn(dateOf(date),timeOf(time));
 let manualArrival=!!explicitArrivalDate;
 const refreshArrival=()=>{
  if(!manualArrival)fields.staDate.value=displayDate(defaultArrivalDate(dateOf('date'),timeOf('std'),timeOf('sta')));
 };
 const sync=(event)=>{
  const changed=event?.target.name;
  if(changed==='staDate')manualArrival=true;
  refreshArrival();
  for(const [airportKey,localKey,dateKey,timeKey] of [
   ['dep','localDeparture','date','std'],['arr','localArrival','staDate','sta']
  ]){
   const local=fields[localKey];
   if(!local)continue;
   const code=resolveAirportInput(fields[airportKey].value), reference=utc(dateKey,timeKey);
   const shown=airportLocalStamp(code,reference);
   const zone=airportInfo(code)?.timezone;
   local.disabled=!validAirportTimezone(zone);
   local.title=local.disabled?tr('Местное время недоступно'):zone;
   if(changed===localKey){
    const time=parseFlightTime(local.value);
    if(!time){
     if(!local.value)fields[timeKey].value='';
     continue;
    }
    const automaticArrival=localKey==='localArrival'&&!manualArrival;
    const start=utc('date','std');
    const localDate=automaticArrival&&Number.isFinite(start)?airportLocalStamp(code,start).slice(0,10):shown.slice(0,10)||dateOf(dateKey);
    if(!localDate){
     local.setCustomValidity(tr('Сначала укажи дату UTC.'));
     continue;
    }
    const today=localToUTC(code,localDate,time,reference);
    const tomorrow=automaticArrival&&Number.isFinite(start)&&today.length&&today.every(candidate=>candidate<start);
    const stamp=tomorrow?localToUTC(code,datePlus(localDate,1),time)[0]:today.find(candidate=>!automaticArrival||!Number.isFinite(start)||candidate>=start);
    if(!Number.isFinite(stamp)){
     local.setCustomValidity(tr('Это местное время недоступно в выбранную дату.'));
     continue;
    }
    const iso=new Date(stamp).toISOString();
    fields[dateKey].value=displayDate(iso.slice(0,10));
    fields[timeKey].value=iso.slice(11,16);
    if(localKey==='localDeparture')refreshArrival();
   }else if([airportKey,timeKey,dateKey,'date','std','localDeparture'].includes(changed)||!changed){
    local.value=shown.slice(11);
    local.setCustomValidity('');
   }
   const localDate=airportLocalStamp(code,utc(dateKey,timeKey)).slice(0,10);
   local.title=[localDate&&displayDate(localDate),local.title].filter(Boolean).join(' · ');
  }
  const scheduled=byId('scheduledDuration');
  if(scheduled){
   const minutes=(utc('staDate','sta')-utc('date','std'))/minute;
   scheduled.textContent=Number.isFinite(minutes)&&minutes>=0?duration(minutes):'—';
  }
 };
 form.addEventListener('input',sync);
 fields.staDate.addEventListener('blur',()=>{
  if(fields.staDate.value)return;
  manualArrival=false;sync();
 });
 sync();
}

const zoneFormatters=new Map();
function validAirportTimezone(zone){
 if(!zone)return false;
 if(!zoneFormatters.has(zone)){
  try {zoneFormatters.set(zone,new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));}
  catch {zoneFormatters.set(zone,null);}
 }
 return !!zoneFormatters.get(zone);
}
function localAirportTime(code,stamp){
 const zone=airportInfo(code)?.timezone;
 return Number.isFinite(stamp)&&validAirportTimezone(zone)?zoneFormatters.get(zone).format(stamp):'';
}
function resolveAirportInput(value){
 const search=value.trim().toUpperCase();
 if(!/^[A-Z]{3,4}$/.test(search))return '';
 if(!search||airport(search))return search;
 const matches=data.airports.filter(a=>a.iata===search);
 return matches.length===1?matches[0].icao:search;
}
const randomInteger=(min,max,random=Math.random)=>min+Math.floor(random()*(max-min+1));
function suggestedPassengers(seats,localArrival,random=Math.random){
 const hour=Number(localArrival.slice(0,2));
 const convenient=hour>=6&&hour<13||hour>=19&&hour<22;
 return randomInteger(Math.ceil(seats*(convenient?.8:.5)),seats,random);
}
const commercialLimit=a=>a.short==='A321'?500:2000;
function suggestedPayload(pax,seats,limit,random=Math.random){
 const baggageKg=Array.from({length:pax},()=>randomInteger(16,20,random)).reduce((a,b)=>a+b,0);
 const cargoKg=1+Math.floor(Math.pow(random(),1.5-Math.min(1,pax/seats))*limit);
 return {baggageKg,cargoKg};
}
// Row numbers are used only to map the reference layouts, never displayed.
const cabinLayouts={
 A321:{business:[2,2],economy:[3,3],first:8,last:35,galleys:[23],
  rowMasks:{11:['111','011']}},
 A350:{business:[1,2,1],comfort:[2,4,2],economy:[3,3,3],first:11,last:40,galleys:[25],
  rowMasks:{40:['000','111','000']}},
 B777:{business:[2,2,2],comfort:[2,4,2],economy:[3,4,3],first:17,last:51,galleys:[24,38],
  rowMasks:{
   17:['101','1111','101'],24:['000','1111','000'],38:['111','0000','111'],
   47:['101','1111','101'],48:['101','1111','101'],49:['101','1111','101'],50:['101','1111','101'],
   51:['000','1111','000']
  }}
};
const seatServiceBay='<div class="seat-service-bay"><i></i><i></i></div>';
const cabinClasses=[['business','Бизнес',2],['comfort','Комфорт',1],['economy','Эконом',0]];
function plannerSeatMap(aircraft){
 const plan=cabinLayouts[aircraft.short];
 const cabins=cabinClasses.flatMap(([kind,label,index])=>{
  const count=aircraft.seats[index];
  if(!count)return [];
  const banks=plan[kind];
  const economy=kind==='economy';
  const rowCount=economy?(plan.last-plan.first+1):count/banks.reduce((sum,bank)=>sum+bank,0);
  const rows=Array.from({length:rowCount},(_,row)=>{
   const number=plan.first+row;
   const rowMask=economy?plan.rowMasks[number]:null;
   const seats=banks.map((bank,column)=>{
    const position=column===0?'left':column===banks.length-1?'right':'center';
    return '<span class="seat-bank" data-bank="'+position+'" style="--seat-count:'+bank+'">'+Array.from({length:bank},(_,seat)=>{
     if(rowMask?.[column][seat]==='0')return '<i class="seat-gap"></i>';
     const windowSeat=position==='left'&&seat===0||position==='right'&&seat===bank-1;
     const aisleSeat=position!=='right'&&seat===bank-1||position!=='left'&&seat===0;
     const location=windowSeat?'window':aisleSeat?'aisle':'middle';
     return '<i class="cabin-seat" data-seat-position="'+location+'" data-seat-weight="'+(location==='middle'?1:3)+'"></i>';
    }).join('')+'</span>';
   }).join('');
   const galley=economy&&plan.galleys.includes(number)?seatServiceBay:'';
   return galley+'<div class="seat-row">'+seats+'</div>';
  }).join('');
  const pitch=kind==='business'?1.48:kind==='comfort'?1.16:1;
  return [{kind,label,count,rows,height:rowCount*pitch}];
 });
 const layout=cabins.map(({kind,rows,height})=>
  '<div class="seat-section" data-cabin="'+kind+'" style="--cabin-height:'+height+'">'+rows+'</div>').join(seatServiceBay);
 const legend=cabins.map(({kind,label,count})=>
  '<li data-cabin="'+kind+'"><i aria-hidden="true"></i><span>'+tr(label)+'</span><strong>'+count+'</strong></li>').join('');
 return '<header class="seat-heading"><h3>'+tr('Схема салона')+'</h3><p class="seat-model">'+esc(aircraftModel(aircraft))+'</p></header>'+
  '<div class="seat-figure" data-airframe="'+aircraft.short+'" aria-hidden="true"><div class="seat-fuselage">'+seatServiceBay+layout+seatServiceBay+'</div></div>'+
  '<footer class="seat-key"><ul class="seat-legend">'+legend+'</ul><ul class="seat-legend seat-occupancy-legend">'+
  '<li><i class="seat-key-occupied" aria-hidden="true"></i>'+tr('Занятые места')+'</li>'+
  '<li><i class="seat-key-open" aria-hidden="true"></i>'+tr('Свободные места')+'</li></ul></footer>';
}

function orderCabinSeats(seats,random=Math.random){
 // Exponential sampling gives window and aisle seats an advantage without
 // making middle seats impossible to take. Reuse the order as loads change.
 return [...seats].map(seat=>({seat,score:-Math.log1p(-random())/Number(seat.dataset.seatWeight)}))
  .sort((a,b)=>a.score-b.score).map(item=>item.seat);
}

function bindPlanningSteps(form){
 const fields=form.elements;
 const steps=[...form.querySelectorAll('[data-flight-step]')];
 const indicators=[...form.querySelectorAll('[data-step-indicator]')];
 const pending={pax:false,baggageKg:false,cargoKg:false};
 let step=0, routeKey='', payloadKey='';
 const itinerary=()=>{
  const dep=resolveAirportInput(fields.dep.value),arr=resolveAirportInput(fields.arr.value);
  const date=parseDisplayDate(fields.date.value.trim()),std=parseFlightTime(fields.std.value),sta=parseFlightTime(fields.sta.value);
  const staDate=parseDisplayDate(fields.staDate.value.trim());
  const times=flightTimes({date,std,sta,staDate});
  return {dep,arr,date,std,sta,staDate,times};
 };
 const clocks=steps.slice(0,2).map(section=>section.querySelector('[data-planner-clock]'));
 const seatMap=byId('plannerSeatMap'), loadTrack=byId('plannerLoadTrack');
 let drawnAircraft, orderedSeats=[], occupiedSeats=-1;
 const updateClocks=()=>{
  const clock=clocks[step];
  if(!clock)return;
  const now=new Date().toISOString();
  clock.dateTime=now;
  clock.querySelector('[data-utc-time]').textContent=now.slice(11,19)+' UTC';
  clock.querySelector('[data-utc-date]').textContent=displayDate(now.slice(0,10));
 };
 const update=()=>{
  const {dep,arr,date,std,sta,staDate,times}=itinerary();
  const aircraft=aircraftFor(fields.tail.value), seats=capacity(aircraft), limit=commercialLimit(aircraft);
  fields.pax.max=seats;fields.baggageKg.max=seats*20;fields.cargoKg.max=limit;
  if(airport(dep)&&airport(arr)&&date&&std&&sta){
   const key=[dep,arr,date,std,sta,staDate,aircraft.tail].join('|');
   if(key!==routeKey){
    routeKey=key;
    if(!pending.pax)fields.pax.value=suggestedPassengers(seats,localAirportTime(arr,times.scheduledArrival));
   }
   const pax=Number(fields.pax.value);
   if(fields.pax.value!==''&&Number.isInteger(pax)&&pax>=0&&pax<=seats){
    const key=[routeKey,pax].join('|');
    if(payloadKey!==key){
     payloadKey=key;
     const suggested=suggestedPayload(pax,seats,limit);
     for(const name of ['baggageKg','cargoKg'])if(!pending[name])fields[name].value=suggested[name];
    }
   }
  }
  const occupied=Math.max(0,Math.min(seats,Math.floor(Number(fields.pax.value))||0));
  const percent=Math.round(100*occupied/seats);
  byId('plannerLoad').textContent=occupied+' / '+seats+' · '+percent+'%';
  loadTrack.style.setProperty('--cabin-load',percent+'%');
  loadTrack.setAttribute('aria-valuenow',percent);
  if(drawnAircraft!==aircraft.short){
   seatMap.innerHTML=plannerSeatMap(aircraft);
   drawnAircraft=aircraft.short;
   orderedSeats=orderCabinSeats(seatMap.querySelectorAll('.cabin-seat'));
   occupiedSeats=-1;
  }
  if(occupiedSeats!==occupied){
   orderedSeats.forEach((seat,index)=>seat.classList.toggle('seat-occupied',index<occupied));
   occupiedSeats=occupied;
  }
  byId('plannerBaggage').textContent=(fields.baggageKg.value||'—')+' '+tr('кг');
  byId('plannerCargo').textContent=(fields.cargoKg.value||'—')+' '+tr('кг');
  const summary=byId('plannerSummary');
  summary.replaceChildren();
  for(const [label,value] of [
   ['Маршрут',[dep,arr].filter(Boolean).map(code=>airportCity(code)+' ('+code+')').join(' → ')],
   ['Дата UTC',displayDate(date)],['Расписание',[std,sta].filter(Boolean).join(' → ')+' UTC'],
   ['Борт',aircraftModel(aircraft)],['Рейс',plannedFlightNumber(fields.flightCode.value,fields.number.value)],['Статус',fields.status.selectedOptions[0]?.textContent],
   ['Пассажиры',byId('plannerLoad').textContent],['Загрузка багажа',byId('plannerBaggage').textContent],
   ['Коммерческий груз',byId('plannerCargo').textContent]
  ]){
   const dt=document.createElement('dt'),dd=document.createElement('dd');
   dt.textContent=tr(label);dd.textContent=value||'—';summary.append(dt,dd);
  }
  updateClocks();
 };
 function openStep(index){
  step=index;
  steps.forEach((section,i)=>section.hidden=i!==step);
  indicators.forEach((item,i)=>i===step?item.setAttribute('aria-current','step'):item.removeAttribute('aria-current'));
  byId('plannerBack').hidden=step===0;
  byId('plannerNext').hidden=step===steps.length-1;
  byId('plannerSave').hidden=step!==steps.length-1;
  const returnButton=byId('plannerReturn');
  if(returnButton)returnButton.hidden=step!==steps.length-1;
  form.querySelector('.flight-editor-body').scrollTop=0;
  update();
 }
 form.addEventListener('input',event=>{
  const name=event.target.name;
  if(Object.hasOwn(pending,name))pending[name]=event.target.value!=='';
  update();
 });
 form.addEventListener('invalid',event=>{
  const current=event.target.closest('[data-flight-step]');
  if(current?.hidden)openStep(steps.indexOf(current));
 },true);
 byId('plannerBack').onclick=()=>openStep(step-1);
 byId('plannerNext').onclick=()=>{
  if([...steps[step].querySelectorAll('input,select')].some(field=>field.willValidate&&!field.reportValidity()))return;
  if(step===0){
   for(const key of ['dep','arr']){
    const code=resolveAirportInput(fields[key].value);
    if(!airport(code)){
     fields[key].setCustomValidity(tr('Выбери ICAO из каталога аэропортов.'));
     fields[key].reportValidity();
     return;
    }
    fields[key].value=code;
   }
   const values=flightFormValues(form);
   if(!values||!validateSchedule(form,values))return;
  }
  openStep(step+1);
 };
 form.addEventListener('submit',event=>{
  if(step===steps.length-1)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  byId('plannerNext').click();
 },true);
 const timer=setInterval(()=>{if(!form.isConnected)clearInterval(timer);else updateClocks();},1000);
 byId('dialog').addEventListener('close',()=>clearInterval(timer),{once:true});
 openStep(0);
}


function flightNumberParts(value){
 return /^([A-Z][0-9]|[0-9][A-Z]|[A-Z]+) *(\d+)([A-Z]?)$/.exec(value.trim().toUpperCase());
}
function formatFlightNumber(value){
 const parts=flightNumberParts(value);
 return parts?parts[1]+' '+parts[2]+parts[3]:value;
}
function nextFlightNumber(value){
 const parts=flightNumberParts(value);
 if(!parts)return '';
 const number=String(BigInt(parts[2])+1n).padStart(parts[2].length,'0');
 return parts[1]+' '+number+parts[3];
}
const flightCodeText=(value,kind)=>(
 kind==='airport'||kind==='airline'?value.replace(/[^A-Za-z]/g,'').slice(0,kind==='airline'?3:4):
 kind==='flight-id'?value.replace(/[^A-Za-z0-9]/g,''):value.replace(/[^A-Za-z0-9 -]/g,'')
).toUpperCase();
function normalizeFlightInputs(form){
 for(const input of form.querySelectorAll('[data-code]')){
  const normalize=()=>{
   const previous=input.value, caret=input.selectionStart;
   const cleaned=flightCodeText(previous,input.dataset.code);
   const value=input.dataset.code==='number'?formatFlightNumber(cleaned):cleaned;
   if(value===previous)return;
   input.value=value;
   if(caret!==null){
    const prefix=flightCodeText(previous.slice(0,caret),input.dataset.code);
    let remaining=prefix.replace(/ /g,'').length;
    let position=0;
    while(position<value.length&&remaining>0)if(value[position++]!==' ')remaining--;
    if(prefix.endsWith(' ')&&value[position]===' ')position++;
    input.setSelectionRange(position,position);
   }
  };
  input.addEventListener('input',event=>{if(!event.isComposing)normalize();});
  input.addEventListener('compositionend',normalize);
 }
}
function legacyFlightMinutes(previous,current){
 return ['atd','ata','atdDate','ataDate'].every(key=>(previous[key]||'')===(current[key]||''))
  ?previous.actualMinutes??null:null;
}
function bindActualDuration(form,previous){
 const fields=form.elements;
 const keys=['date','std','sta','staDate','atd','ata','atdDate','ataDate'];
 const update=()=>{
  const values=Object.fromEntries(keys.map(key=>{
   const field=fields[key];
   return [key,!field?'':field.matches('[data-flight-date]')?parseDisplayDate(field.value.trim()):parseFlightTime(field.value)];
  }));
  fields.actualMinutes.value=actualFlightMinutes(values)??legacyFlightMinutes(previous,values)??'';
 };
 form.addEventListener('input',event=>{if(keys.includes(event.target.name))update();});
 update();
}


function bindLocalFlightTimes(form,endpoints){
 const fields=form.elements;
 const outputs=[...form.querySelectorAll('[data-local-time]')];
 const update=()=>{
  const values=Object.fromEntries(['date','std','sta','staDate','atd','ata','atdDate','ataDate'].map(key=>{
   const field=fields[key];
   return [key,!field?'':field.matches('[data-flight-date]')?parseDisplayDate(field.value.trim()):parseFlightTime(field.value)];
  }));
  const times=flightTimes(values);
  const dep=endpoints?.dep??resolveAirportInput(fields.dep.value);
  const arr=endpoints?.arr??resolveAirportInput(fields.arr.value);
  const entries={
   std:[dep,times.scheduledDeparture],sta:[arr,times.scheduledArrival],
   atd:[dep,times.actualDeparture],ata:[arr,times.actualArrival]
  };
  for(const node of outputs){
   const [code,stamp]=entries[node.dataset.localTime];
   const time=localAirportTime(code,stamp);
   node.textContent=time?tr('Местное время')+' · '+time:tr('Местное время')+' · —';
  }
 };
 form.addEventListener('input',update);
 update();
}
