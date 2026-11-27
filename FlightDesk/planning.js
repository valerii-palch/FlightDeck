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
 const matches=data.airports.filter(a=>airportIata(a.icao)===search);
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
  '<li data-cabin="'+kind+'"><i aria-hidden="true"></i><span>'+tr(label)+'</span><strong data-cabin-count="'+kind+'" data-capacity="'+count+'">0 / '+count+'</strong></li>').join('');
 return '<header class="seat-heading"><h3>'+tr('Схема салона')+'</h3><p class="seat-model">'+esc(aircraftModel(aircraft))+'</p></header>'+
  '<div class="seat-figure" data-airframe="'+aircraft.short+'" aria-hidden="true"><div class="seat-fuselage">'+seatServiceBay+layout+seatServiceBay+'</div></div>'+
  '<footer class="seat-key"><ul class="seat-legend">'+legend+'</ul></footer>';
}

// Cabin stations are traced from the supplied layouts, with the nose on the left.
const fleetCabinStations={
 A321:{business:[[1,4,211,23]],economy:[[8,10,318,18],[11,22,384,18.3],[23,35,654,19]],
  wings:[440,603],fixtures:[[143,89,23,23],[614,48,24,28],[614,88,24,28],[899,93,21,24]]},
 A350:{business:[[1,7,196,20.3]],comfort:[[8,10,393,16.4]],economy:[[11,24,452,13.6],[25,40,683,13.35]],
  wings:[391,627],fixtures:[[160,50,19,16],[160,104,19,16],[340,66,11,38],[366,60,18,50],[635,45,25,73],[915,50,24,18],[915,101,24,18]]},
 B777:{business:[[1,5,154,22]],comfort:[[11,16,321,14]],economy:[[17,23,412,13],[24,24,517,0],[25,37,528,13],[38,51,721,12.4]],
  wings:[430,620],fixtures:[[96,69,25,31],[271,55,34,54],[496,45,13,74],[693,44,19,76],[901,43,18,28],[915,73,22,25],[901,100,18,21]]}
};
function fleetCabinDiagram(aircraft){
 const {short}=aircraft, plan=cabinLayouts[short], stations=fleetCabinStations[short];
 const [wingStart,wingEnd]=stations.wings;
 const fixture=(x,y,width,height)=>`<rect class="cabin-fixture" x="${x}" y="${y}" width="${width}" height="${height}" rx="3"/>`;
 const cabins=cabinClasses.map(([kind])=>{
  const banks=plan[kind];
  if(!banks)return '';
  const economy=kind==='economy', wide=banks.length===3;
  const width=kind==='business'?13:kind==='comfort'?10:8, height=kind==='business'?12:8;
  const seat=(number,x,bank,index)=>{
   if(economy&&plan.rowMasks[number]?.[bank][index]==='0')return '';
   const middle=wide&&bank===1, right=bank===banks.length-1;
   const gap=height+2;
   let y=middle?82-(banks[bank]-1)*gap/2+index*gap:right?115-(banks[bank]-1-index)*gap:49+index*gap;
   const angle=kind==='business'&&short==='B777'?(right?-12:12):0;
   if(kind==='business'&&short==='A350'&&number%2===0&&!middle)y+=right?-3:3;
   return `<rect class="cabin-seat-shape" x="${x-width/2}" y="${y-height/2}" width="${width}" height="${height}" rx="2"${angle?` transform="rotate(${angle} ${x} ${y})"`:''}/>`;
  };
  const rows=stations[kind].map(([first,last,start,pitch])=>Array.from({length:last-first+1},(_,index)=>{
   const number=first+index, x=start+index*pitch;
   return banks.map((size,bank)=>Array.from({length:size},(_,index)=>seat(number,x,bank,index)).join('')).join('');
  }).join('')).join('');
  return '<g data-cabin="'+kind+'">'+rows+'</g>';
 }).join('');
 return `<svg class="fleet-cabin-diagram" viewBox="0 0 1000 164" role="img" aria-label="${tr('Схема салона')} · ${esc(aircraftModel(aircraft))}">
 <path class="cabin-wing" d="M${wingStart} 43l28-41h${wingEnd-wingStart-28}v44z M${wingStart} 121l28 41h${wingEnd-wingStart-28}v-44z"/>
 <path class="cabin-shell" d="M18 82C48 53 100 39 182 39H887q60 0 89 19 26 24 0 49-32 18-89 18H182C100 125 48 111 18 82Z"/>
 <path class="cabin-fixture" d="M48 81l14-15 15-6-7 10-11 12 11 12 7 10-15-6-14-15z"/>
 ${stations.fixtures.map(box=>fixture(...box)).join('')}${cabins}</svg>`;
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
 const body=form.querySelector('.flight-editor-body');
 let step=0, routeKey='', payloadKey='', stepMotion;
 form.noValidate=true;
 const itinerary=()=>{
  const dep=resolveAirportInput(fields.dep.value),arr=resolveAirportInput(fields.arr.value);
  const date=parseDisplayDate(fields.date.value.trim()),std=parseFlightTime(fields.std.value),sta=parseFlightTime(fields.sta.value);
  const staDate=parseDisplayDate(fields.staDate.value.trim());
  const times=flightTimes({date,std,sta,staDate});
  return {dep,arr,date,std,sta,staDate,times};
 };
 const clocks=steps.slice(0,2).map(section=>section.querySelector('[data-planner-clock]'));
 const seatMap=byId('plannerSeatMap'), loadTrack=byId('plannerLoadTrack');
 const summaryFields=[...byId('plannerSummary').querySelectorAll('[data-summary]')];
 let drawnAircraft, orderedSeats=[], cabinCounters=[], occupiedSeats=-1;
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
   cabinCounters=[...seatMap.querySelectorAll('[data-cabin-count]')].map(counter=>
    [counter,seatMap.querySelector('.seat-section[data-cabin="'+counter.dataset.cabinCount+'"]')]);
   occupiedSeats=-1;
  }
  if(occupiedSeats!==occupied){
   orderedSeats.forEach((seat,index)=>seat.classList.toggle('seat-occupied',index<occupied));
   for(const [counter,cabin] of cabinCounters){
    counter.textContent=cabin.querySelectorAll('.seat-occupied').length+' / '+counter.dataset.capacity;
   }
   occupiedSeats=occupied;
  }
  byId('plannerBaggage').textContent=(fields.baggageKg.value||'—')+' '+tr('кг');
  byId('plannerCargo').textContent=(fields.cargoKg.value||'—')+' '+tr('кг');
  if(step===steps.length-1){
   const summary={
    flight:plannedFlightNumber(fields.flightCode.value,fields.number.value),
    status:fields.status.selectedOptions[0]?.textContent,
    departureTime:std,departureDate:displayDate(date),departureCode:dep,departureCity:dep&&airportCity(dep),
    arrivalTime:sta,arrivalDate:displayDate(staDate||defaultArrivalDate(date,std,sta)),arrivalCode:arr,arrivalCity:arr&&airportCity(arr),
    aircraft:aircraftModel(aircraft),tail:aircraft.tail,passengers:byId('plannerLoad').textContent,
    baggage:byId('plannerBaggage').textContent,cargo:byId('plannerCargo').textContent
   };
   for(const field of summaryFields)field.textContent=summary[field.dataset.summary]||'—';
  }
  updateClocks();
 };
 function openStep(index,animate=true){
  const direction=Math.sign(index-step);
  stepMotion?.cancel();
  step=index;
  steps.forEach((section,i)=>section.hidden=i!==step);
  indicators.forEach((item,i)=>i===step?item.setAttribute('aria-current','step'):item.removeAttribute('aria-current'));
  byId('plannerBack').hidden=step===0;
  byId('plannerNext').hidden=step===steps.length-1;
  byId('plannerSave').hidden=step!==steps.length-1;
  const returnButton=byId('plannerReturn');
  if(returnButton)returnButton.hidden=step!==steps.length-1;
  body.scrollTop=0;
  update();
  if(animate&&direction&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const distance=(isWindowsDesktop?24:72)*direction;
   stepMotion=steps[step].animate([
    {transform:`translateX(${distance}px)`,opacity:.2},
    {transform:'translateX(0)',opacity:1}
   ],{duration:isWindowsDesktop?180:360,easing:'cubic-bezier(.22,.74,.25,1)'});
  }
 }
 function validateBefore(index){
  for(let i=0;i<index;i++){
   const invalid=[...steps[i].querySelectorAll('input,select')].find(field=>field.willValidate&&!field.validity.valid);
   if(invalid){
    if(i!==step)openStep(i,false);
    invalid.reportValidity();
    return false;
   }
   if(i===0){
    for(const key of ['dep','arr']){
     const code=resolveAirportInput(fields[key].value);
     if(!airport(code)){
      fields[key].setCustomValidity(tr('Выбери ICAO из каталога аэропортов.'));
      fields[key].reportValidity();
      return false;
     }
     fields[key].value=code;
    }
    const values=flightFormValues(form);
    if(!values||!validateSchedule(form,values))return false;
   }
  }
  return true;
 }
 function navigateTo(index){
  if(index!==step&&(index<step||validateBefore(index)))openStep(index);
 }
 form.addEventListener('input',event=>{
  const name=event.target.name;
  if(Object.hasOwn(pending,name))pending[name]=event.target.value!=='';
  update();
 });
 form.addEventListener('invalid',event=>{
  const current=event.target.closest('[data-flight-step]');
  if(current?.hidden){
   openStep(steps.indexOf(current),false);
   event.target.focus();
  }
 },true);
 indicators.forEach((button,index)=>{button.onclick=()=>navigateTo(index);});
 byId('plannerBack').onclick=()=>navigateTo(step-1);
 byId('plannerNext').onclick=()=>navigateTo(step+1);
 form.addEventListener('submit',event=>{
  const final=step===steps.length-1;
  if(final&&validateBefore(step))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!final)navigateTo(step+1);
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

// Actual data is edited separately so the original schedule and payload remain intact.
function editActualFlight(existing,divert=false,parent=null) {
 const f={...existing,status:divert?'Уход на запасной':existing.status};
 const times=flightTimes(f);
 const dateInput=(name,value)=>dateField(name,value||'',false);
 const timeInput=(name,value)=>timeField(name,value||'',false,true);
 const side=(key,code,title)=>{
  const dateKey=key+'Date', stamp=key==='atd'?times.actualDeparture:times.actualArrival;
  const local=airportLocalStamp(code,stamp);
  return '<section class="flight-editor-section"><h3>'+tr(title)+' · '+esc(code)+'</h3><div class="flight-editor-fields">'+
   '<label>'+tr('Дата UTC')+dateInput(dateKey,f[dateKey]||(Number.isFinite(stamp)?new Date(stamp).toISOString().slice(0,10):f.date))+'</label>'+
   '<label>UTC'+timeInput(key,f[key])+'</label>'+
   '<label>'+tr('Местная дата')+dateInput(key+'LocalDate',local.slice(0,10))+'</label>'+
   '<label>'+tr('Местное время')+timeInput(key+'Local',local.slice(11))+'</label></div></section>';
 };
 const arrivalCode=()=>form.elements.diversionAirport?.value.trim().toUpperCase()||f.arr;
 openDialog('<header class="flight-editor-header"><h2 id="flightEditorTitle">'+tr('Фактические данные')+' · '+flightNumber(f)+'</h2>'+
  '<button type="button" class="icon-button" data-action="close" aria-label="'+tr('Закрыть')+'">'+toolbarIcon('close')+'</button></header>'+
  '<form id="editForm" class="editor flight-editor actual-editor"><div class="flight-editor-body">'+
  '<section class="flight-editor-section"><div class="flight-editor-fields"><label>'+tr('Статус')+
  '<select name="status">'+statuses.map(s=>option(s,tr(s),f.status)).join('')+'</select></label>'+
  '<label id="actualAlternate">'+tr('Фактический запасной ICAO')+'<input name="diversionAirport" data-code="airport" maxlength="4" value="'+esc(alternate(f))+'"></label></div></section>'+
  side('atd',f.dep,'Вылет')+side('ata',isDiversion(f)?alternate(f)||f.arr:f.arr,'Прилет')+
  '<section class="flight-editor-section"><div id="actualArrivalPreview"></div><label>'+tr('Примечание')+
  '<textarea name="note" rows="2">'+esc(f.note||'')+'</textarea></label></section></div>'+
  '<footer class="flight-editor-footer"><button type="button" data-action="close">'+tr('Отмена')+'</button>'+
  '<button type="submit" id="plannerSave" class="primary">'+tr('Сохранить')+'</button></footer></form>','flight');
 const form=byId('editForm'), fields=form.elements;
 if(parent){
  const button=document.createElement('button');
  button.type='button';button.id='removeContinuation';button.textContent=tr('Удалить продолжение');
  form.querySelector('footer').prepend(button);
  button.onclick=()=>{
   if(button.dataset.confirmed!=='true'){button.dataset.confirmed='true';button.textContent=tr('Подтвердить удаление');return;}
   delete parent.continuation;save();byId('dialog').close();render();
  };
 }
 normalizeFlightInputs(form);
 const value=(name)=>fields[name].matches('[data-flight-date]')?parseDisplayDate(fields[name].value.trim()):parseFlightTime(fields[name].value);
 const sync=event=>{
  const name=event?.target.name;
  for(const key of ['atd','ata']){
   const code=key==='atd'?f.dep:fields.status.value==='Уход на запасной'?arrivalCode():f.arr;
   const local=fields[key+'Local'],localDate=fields[key+'LocalDate'];
   const valid=validAirportTimezone(airportInfo(code)?.timezone);
   local.disabled=localDate.disabled=!valid;
   if(name===key+'Local'||name===key+'LocalDate'){
    const date=value(key+'LocalDate'),time=value(key+'Local');
    local.setCustomValidity('');
    if(!time){fields[key].value='';continue;}
    const candidate=localToUTC(code,date,time,clockOn(value(key+'Date'),value(key)))[0];
    if(!Number.isFinite(candidate)){local.setCustomValidity(tr('Не удалось определить время. Проверь дату и часовой пояс.'));continue;}
    const utc=new Date(candidate).toISOString();
    fields[key].value=utc.slice(11,16);fields[key+'Date'].value=displayDate(utc.slice(0,10));
   }else{
    const stamp=clockOn(value(key+'Date'),value(key));
    const shown=airportLocalStamp(code,stamp);
    local.value=shown.slice(11);localDate.value=shown?displayDate(shown.slice(0,10)):'';
    local.setCustomValidity('');
   }
  }
  byId('actualAlternate').hidden=fields.status.value!=='Уход на запасной';
  fields.diversionAirport.required=fields.status.value==='Уход на запасной';
  const t=flightTimes({...f,status:fields.status.value,atd:value('atd'),ata:value('ata'),atdDate:value('atdDate'),ataDate:value('ataDate')});
  const estimate=!Number.isFinite(t.actualArrival)&&Number.isFinite(t.estimatedArrival);
  byId('actualArrivalPreview').innerHTML='<p class="muted">'+tr('Прилет')+' · UTC</p>'+
   flightTimeStack(t.scheduledArrival,estimate?t.estimatedArrival:t.actualArrival,f.date,false,estimate);
 };
 form.addEventListener('input',event=>{event.target.setCustomValidity?.('');sync(event);});
 form.addEventListener('change',sync);
 sync();
 form.onsubmit=event=>{
  event.preventDefault();
  const values=flightFormValues(form);
  if(!values||!form.reportValidity())return;
  const patch=Object.fromEntries(['atd','ata','atdDate','ataDate','note'].map(k=>[k,values[k]]));
  if(patch.atd&&!patch.atdDate||patch.ata&&!patch.ataDate)return;
  const result={...f,...patch};
  if(!parent){
   result.diversionAirport=values.status==='Уход на запасной'?values.diversionAirport.trim().toUpperCase():'';
   if(values.status==='Уход на запасной'&&(!airport(result.diversionAirport)||result.diversionAirport===f.arr)){
    fields.diversionAirport.setCustomValidity(tr('Выбери запасной аэропорт из каталога.'));form.reportValidity();return;
   }
   if(f.continuation&&values.status!=='Уход на запасной'){
    fields.status.setCustomValidity(tr('Сначала удали продолжение в карточке рейса, чтобы снять отметку об уходе на запасной.'));form.reportValidity();return;
   }
  }
  if(!setFlightStatus(result,values.status)){
   fields.ata.setCustomValidity(tr('Прилет должен быть после вылета.'));form.reportValidity();return;
  }
  const t=flightTimes(result);
  const next=f.continuation?flightTimes(f.continuation):null;
  const inbound=parent?flightTimes(parent).actualArrival:NaN;
  if(t.actualArrival<t.actualDeparture||Number.isFinite(inbound)&&(t.actualDeparture||t.scheduledDeparture)<inbound||
   next&&(t.actualArrival>next.actualDeparture||t.actualArrival>next.actualArrival)){
   fields.ata.setCustomValidity(tr('Проверь порядок времени участков рейса.'));form.reportValidity();return;
  }
  result.actualMinutes=actualFlightMinutes(result)??legacyFlightMinutes(existing,result);
  if(parent)Object.assign(parent.continuation,{...patch,status:result.status,atd:result.atd,ata:result.ata,
   atdDate:result.atdDate,ataDate:result.ataDate,actualMinutes:result.actualMinutes});
  else Object.assign(existing,result);
  save();render();byId('dialog').close();
 };
}
