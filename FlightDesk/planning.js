function medianMinutes(values) {
 const sorted=[...values].sort((a,b)=>a-b), mid=Math.floor(sorted.length/2);
 return Math.round(sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2);
}
function routeDurationEstimate(dep, arr, aircraftTail, excludeID) {
 const type=aircraftFor(aircraftTail)?.short;
 const samples=data.flights.filter(f=>!f.demo&&f.id!==excludeID).flatMap(physicalLegs)
  .filter(f=>f.dep===dep&&f.arr===arr&&f.status!=='Отменен'&&!isDiversion(f)&&legFlown(f))
  .map(f=>{const t=flightTimes(f);return {
   minutes:Number.isFinite(f.actualMinutes)?f.actualMinutes:(t.actualArrival-t.actualDeparture)/minute,
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
  const dep=form.elements.dep.value.trim().toUpperCase(),arr=form.elements.arr.value.trim().toUpperCase();
  const local=routeDurationEstimate(dep,arr,form.elements.tail.value);
  estimate=local||remote;
  output.textContent=estimate?tr('Примерное время')+': '+duration(estimate.minutes)+' · '+tr(estimate.source==='journal'?'По журналу':'Реальные рейсы')+' ('+estimate.count+')':tr('Нет данных для оценки этого маршрута.');
  if(local&&remote) output.textContent+=' · '+tr('Реальные рейсы')+': '+duration(remote.minutes)+' ('+remote.count+')';
  apply.disabled=!estimate||!parseFlightTime(form.elements.std.value);
 };
 const update=()=>{
  generation++;const current=generation;delete form.dataset.estimatedMinutes;
  controller?.abort();clearTimeout(timer);remote=null;renderEstimate();
  const dep=form.elements.dep.value.trim().toUpperCase(),arr=form.elements.arr.value.trim().toUpperCase();
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
