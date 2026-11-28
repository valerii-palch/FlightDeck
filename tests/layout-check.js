// Runs in both native WebKit and Electron with synthetic flights only.
async function verifyFlightLayout(theme) {
 const check=(ok,label)=>{if(!ok)throw new Error('Flight layout: '+label);};
 const near=(a,b)=>Math.abs(a-b)<1.1;
 updateDaylight=()=>{document.body.dataset.daylight=theme;};updateDaylight();
 const saved={flights:data.flights,airports:data.airports,page,tail,selected,explicitAircraft};
 data.airports=[
  {icao:'UUEE',iata:'SVO',cityRu:'Москва',nameRu:'Международный аэропорт Шереметьево имени А. С. Пушкина',timezone:'Europe/Moscow'},
  {icao:'VVCR',iata:'CXR',cityRu:'Нячанг',nameRu:'Международный аэропорт Камрань',timezone:'Asia/Ho_Chi_Minh'}
 ];
 const base={id:'layout-test',number:'AFL 0295',tail:fleet[0].tail,dep:'UUEE',arr:'VVCR',date:'2026-11-27',std:'19:05',sta:'05:25',staDate:'2026-11-28',pax:120};
 const cases=[
  {status:'Запланирован'},
  {status:'Вылетел',atd:'19:37'},
  {status:'Выполнен',atd:'19:37',ata:'06:12',ataDate:'2026-11-28'},
  {status:'Выполнен',atd:'19:05',ata:'05:25',ataDate:'2026-11-28'},
  {status:'Вылетел',atd:'19:37',atdDate:'2026-11-29'},
  {status:'Отменен'},
  {status:'Уход на запасной',diversionAirport:'USPP',atd:'19:37',ata:'22:00',continuation:{date:'2026-11-28',std:'00:00',sta:'06:00',atd:'00:20',dep:'USPP',arr:'VVCR',status:'Вылетел'}}
 ];
 const verify=()=>{
  const endpoints=[...document.querySelectorAll('.flight-route-summary .route-summary-endpoint')];
  check(endpoints.length===2,'two endpoints');
  for(const selector of [':scope>small:first-child','.flight-time-stack strong','.route-local','.route-city','.code',':scope>small:last-child']) {
   const rects=endpoints.map(e=>e.querySelector(selector).getBoundingClientRect());
   check(near(rects[0].top,rects[1].top),'shared row '+selector);
  }
  for(const el of document.querySelectorAll('del .clock-value'))check(getComputedStyle(el).textDecorationLine.includes('line-through'),'planned time strike');
  for(const stamp of document.querySelectorAll('main .clock-stamp')) {
   const badge=stamp.querySelector('.day-offset'),value=stamp.querySelector('.clock-value');
   if(!badge)continue;
   const b=badge.getBoundingClientRect(),v=value.getBoundingClientRect();
   check(near(b.top+b.height/2,v.top+v.height/2),'day badge center');
   check(near(b.height,20),'day badge height');
   check(near(b.left-v.right,6),'day badge spacing');
  }
 };
 for(const extra of cases) {
  data.flights=[{...base,...extra}];tail=base.tail;selected=base.id;explicitAircraft=true;
  for(const section of ['home','center','journal']) {
   page=section;render();
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   if(section!=='journal'&&document.querySelector('.flight-route-summary'))verify();
   else for(const value of document.querySelectorAll('.board-time del .clock-value'))check(getComputedStyle(value).textDecorationLine.includes('line-through'),'journal strike');
   if(section==='home') {
    const styles=[...document.querySelectorAll('.dashboard-card')].map(e=>{const s=getComputedStyle(e);return [s.backgroundImage,s.backgroundColor,s.borderTopColor,s.backdropFilter].join('|');});
    check(new Set(styles).size===1,'matching dashboard surfaces '+theme);
   }
  }
 }
 // Leave a delayed overnight flight on screen for native screenshot inspection.
 data.flights=[{...base,...cases[2]}];page='home';render();
 await new Promise(resolve=>setTimeout(resolve,2700));
 verify();
 window.restoreFlightLayoutFixture=()=>{data.flights=saved.flights;data.airports=saved.airports;page=saved.page;tail=saved.tail;selected=saved.selected;explicitAircraft=saved.explicitAircraft;render();};
 return 'PASS: shared endpoint rows, time strikes, centered day badges and '+theme+' surfaces at '+innerWidth+'px';
}
