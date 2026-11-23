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
 return values.length?{minutes:medianMinutes(values),count:values.length,source:'journal'}:null;
}
function bindDurationEstimate(form) {
 const output=byId('durationEstimate'),apply=byId('applyDurationEstimate');
 let estimate=null,remote=null,generation=0,controller,timer;
 const renderEstimate=()=>{
  const dep=resolveAirportInput(form.elements.dep.value),arr=resolveAirportInput(form.elements.arr.value);
  const local=routeDurationEstimate(dep,arr,form.elements.tail.value);
  estimate=local||remote;
  output.textContent=estimate?tr('Примерное время')+': '+duration(estimate.minutes)+' · '+tr(estimate.source==='journal'?'По журналу':'Реальные рейсы')+' ('+estimate.count+')':tr('Нет данных для оценки этого маршрута.');
  if(local&&remote) output.textContent+=' · '+tr('Реальные рейсы')+': '+duration(remote.minutes)+' ('+remote.count+')';
  apply.disabled=!estimate||!parseFlightTime(form.elements.std.value);
 };
 const update=()=>{
  generation++;const current=generation;delete form.dataset.estimatedMinutes;
  controller?.abort();clearTimeout(timer);remote=null;renderEstimate();
  const dep=resolveAirportInput(form.elements.dep.value),arr=resolveAirportInput(form.elements.arr.value);
  if(!/^[A-Z]{4}$/.test(dep)||!/^[A-Z]{4}$/.test(arr)||dep===arr) return;
  timer=setTimeout(async()=>{
   const requestController=new AbortController();
   controller=requestController;
   try{
    const timeout=setTimeout(()=>requestController.abort(),30000);
    let result;
    try { result=await lookupRealRoute(dep,arr,requestController.signal); }
    finally { clearTimeout(timeout); }
    if(current!==generation||!form.isConnected) return;
    if(Number.isFinite(result.minutes)&&result.minutes>0&&result.minutes<1440&&Number.isInteger(result.count)&&result.count>0)
     remote={minutes:result.minutes,count:result.count,source:'real'};
    renderEstimate();
   }catch(error){
    if(current!==generation||!form.isConnected) return;
    renderEstimate();output.textContent+=' '+realRouteError(error);
   }
  },700);
 };
 for(const key of ['dep','arr','tail']) form.elements[key].addEventListener('input',update);
 form.elements.std.addEventListener('input',renderEstimate);
 apply.onclick=()=>{
  if(!estimate||!parseFlightTime(form.elements.std.value)) return;
  const [hours,minutes]=parseFlightTime(form.elements.std.value).split(':').map(Number);
  const arrival=(hours*60+minutes+estimate.minutes)%1440;
  form.elements.sta.value=String(Math.floor(arrival/60)).padStart(2,'0')+':'+String(arrival%60).padStart(2,'0');
  form.elements.sta.dispatchEvent(new Event('input',{bubbles:true}));
  form.dataset.estimatedMinutes=String(estimate.minutes);
 };
 form.addEventListener('input',e=>{if(e.target.name==='sta')delete form.dataset.estimatedMinutes;});
 byId('dialog').addEventListener('close',()=>{generation++;controller?.abort();clearTimeout(timer);},{once:true});
 update();
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
function bindPlanningSteps(form){
 const fields=form.elements;
 const steps=[...form.querySelectorAll('[data-flight-step]')];
 const indicators=[...form.querySelectorAll('[data-step-indicator]')];
 const pending={pax:false,baggageKg:false,cargoKg:false};
 let step=0, routeKey='', payloadKey='';
 const now=()=>Date.now();
 const itinerary=()=>{
  const dep=resolveAirportInput(fields.dep.value),arr=resolveAirportInput(fields.arr.value);
  const date=parseDisplayDate(fields.date.value.trim()),std=parseFlightTime(fields.std.value),sta=parseFlightTime(fields.sta.value);
  const times=flightTimes({date,std,sta});
  return {dep,arr,date,std,sta,times};
 };
 const updateClocks=()=>{
  const {dep,arr,times}=itinerary();
  const instant=now();
  byId('plannerUtc').textContent=new Date(instant).toISOString().slice(11,19)+' UTC';
  for(const [code,side,stamp] of [[dep,'Dep',times.scheduledDeparture],[arr,'Arr',times.scheduledArrival]]){
   byId('planner'+side+'Label').textContent=airport(code)?airportCity(code):tr(side==='Dep'?'Вылет':'Прилет');
   const local=localAirportTime(code,instant);
   byId('planner'+side+'Now').textContent=local||'—';
   const scheduled=localAirportTime(code,stamp);
   byId('planner'+side+'Plan').textContent=scheduled?tr('По плану')+' · '+scheduled:tr('Местное время недоступно');
  }
 };
 const update=()=>{
  const {dep,arr,date,std,sta,times}=itinerary();
  const aircraft=aircraftFor(fields.tail.value), seats=capacity(aircraft), limit=commercialLimit(aircraft);
  fields.pax.max=seats;fields.baggageKg.max=seats*20;fields.cargoKg.max=limit;
  if(airport(dep)&&airport(arr)&&date&&std&&sta){
   const key=[dep,arr,date,std,sta,aircraft.tail].join('|');
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
  const passengers=Number(fields.pax.value);
  const load=Math.max(0,Math.min(1,passengers/seats));
  byId('plannerLoad').textContent=passengers+' / '+seats+' · '+Math.round(100*load)+'%';
  byId('plannerCabin').style.setProperty('--cabin-load',Math.round(load*100)+'%');
  byId('plannerBaggage').textContent=(fields.baggageKg.value||'—')+' '+tr('кг');
  byId('plannerCargo').textContent=(fields.cargoKg.value||'—')+' '+tr('кг');
  const summary=byId('plannerSummary');
  summary.replaceChildren();
  for(const [label,value] of [
   ['Маршрут',[dep,arr].filter(Boolean).map(code=>airportCity(code)+' ('+code+')').join(' → ')],
   ['Дата UTC',displayDate(date)],['Расписание',[std,sta].filter(Boolean).join(' → ')+' UTC'],
   ['Борт',aircraftModel(aircraft)],['Рейс',fields.number.value],['Статус',tr(fields.status.value)],
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
  byId('plannerSave').hidden=byId('plannerReturn').hidden=step!==steps.length-1;
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
   if(!flightFormValues(form))return;
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
 openStep(0);
}


const flightCodeText=(value,kind)=>(
 kind==='airport'?value.replace(/[^A-Za-z]/g,'').slice(0,4):value.replace(/[^A-Za-z0-9 -]/g,'')
).toUpperCase();
function normalizeFlightInputs(form){
 for(const input of form.querySelectorAll('[data-code]')){
  const normalize=()=>{
   const previous=input.value, caret=input.selectionStart;
   const value=flightCodeText(previous,input.dataset.code);
   if(value===previous)return;
   input.value=value;
   if(caret!==null){
    const position=flightCodeText(previous.slice(0,caret),input.dataset.code).length;
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
 const keys=['date','std','sta','atd','ata','atdDate','ataDate'];
 const update=()=>{
  const values=Object.fromEntries(keys.map(key=>{
   const field=fields[key];
   return [key,field.matches('[data-flight-date]')?parseDisplayDate(field.value.trim()):parseFlightTime(field.value)];
  }));
  fields.actualMinutes.value=actualFlightMinutes(values)??legacyFlightMinutes(previous,values)??'';
 };
 form.addEventListener('input',event=>{if(keys.includes(event.target.name))update();});
 update();
}
