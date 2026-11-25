const countryGroups = {
 'Европа':'AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
 'Азия':'AE AF AM AZ BD BH BN BT CN CY GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE',
 'Африка':'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
 'Северная Америка':'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
 'Южная Америка':'AR BO BR CL CO EC FK GF GY PE PY SR UY VE',
 'Океания':'AS AU CC CK CX FJ FM GU HM KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS',
 'Антарктида':'AQ BV GS TF'
};
const countryContinents=new Map(Object.entries(countryGroups).flatMap(([region,codes])=>codes.split(' ').map(code=>[code,region])));
const displayCountries=Object.fromEntries(['ru','en'].map(locale=>[locale,new Intl.DisplayNames(locale,{type:'region',fallback:'code'})]));
const countryName=code=>displayCountries[appLanguage()].of(code);
const knownCountries={ARMENIA:'AM',AZERBAIJAN:'AZ',BELARUS:'BY',CHINA:'CN',CUBA:'CU',EGIPT:'EG','HONG KONG':'HK',INDIA:'IN',INDONESIA:'ID',KAZAKHSTAN:'KZ',KYRGYZSTAN:'KG',MALDIVES:'MV',SEYCHELLES:'SC','SRI-LANKA':'LK',THAILAND:'TH',TURKEY:'TR',UAE:'AE',UZBEKISTAN:'UZ',VIETNAM:'VN','РОССИЯ':'RU',RUSSIA:'RU'};
const airportCountry=a=>a?.countryCode||knownCountries[a?.country?.trim().toUpperCase()];
const preferences=()=>{
 return {profileName:'',...data.preferences};
};
const summaryFlights=()=>data.flights.filter(f=>!f.demo);
const mapKeyPattern=/^[A-Za-z0-9_-]{20,120}$/;
const mapConfig=JSON.parse(byId('map-config').textContent);
const tilesKey=mapConfig.tilesKey;
const mapsKey=(()=>{
 let legacyKey;
 try {legacyKey=localStorage.getItem('flightdeck.yandexMapsKey');} catch {}
 const bundledKey=mapConfig.yandexKey;
 return [bundledKey,window.flightDeckMapsKey,legacyKey].find(key=>typeof key==='string'&&mapKeyPattern.test(key));
})();

function editSettings(anchor = null) {
 const link=([action,label])=>`<button type="button" data-action="${action}"><span>${tr(label)}</span><span aria-hidden="true">›</span></button>`;
 const section=(title,links)=>'<fieldset class="settings-section"><legend>'+tr(title)+'</legend><div class="settings-links">'+links.map(link).join('')+'</div></fieldset>';
 openDialog(`<header class="settings-header"><h2 id="settingsTitle" tabindex="-1" autofocus>${tr("Настройки")}</h2><button class="icon-button" data-action="close" aria-label="${tr("Закрыть настройки")}">`+toolbarIcon('close')+'</button></header>'+
 '<div class="settings-layout settings-flyout">'+
 section('Приложение',[['tour','Повторить обучение'],['feedback','Обратная связь']])+
 section('Журнал',[['backup','Резервная копия'],['reset-profile','Сбросить рейсы и профиль']])+
 section('Обновления',[['update','Обновить приложение']])+'</div>','settings',anchor);
}

function editProfileName() {
 openDialog(`<h2>${tr('Изменить имя')}</h2><form id="profileNameForm" class="stack">
 <label>${tr('Имя в профиле')}<input name="profileName" autocomplete="nickname" maxlength="80" value="${esc(preferences().profileName)}" autofocus></label>
 <div class="controls"><button type="submit" class="primary">${tr('Сохранить')}</button><button type="button" data-action="close">${tr('Отмена')}</button></div></form>`);
 const form=byId('profileNameForm');
 form.elements.profileName.focus();
 form.onsubmit=event=>{
  event.preventDefault();
  data.preferences={...preferences(),profileName:form.elements.profileName.value.trim()};
  save();byId('dialog').close();render();
  document.querySelector('[data-action="profile-name"]')?.focus();
 };
}

const sceneryFields=[['developer','Разработчик',120],['version','Версия',60]];
function airportSceneryDetails(airport) {
 return `<details class="airport-scenery full"><summary>${tr('Сведения о сценарии')}</summary><div class="settings-fields">`+
  sceneryFields.map(([key,label,limit])=>`<label>${tr(label)}<input name="${key}" maxlength="${limit}" value="${esc(airport?.[key])}"></label>`).join('')+
  '</div></details>';
}

function openAirportCard(code){
 const a=airport(code);
 if(!a)return;
 const flags=[['scenery','Сценарий аэропорта'],['gsx','Профиль GSX'],['python','Расширение Python']];
 const parking=[['narrow','Стоянки Airbus A321'],['wide','Стоянки Airbus A350 и Boeing 777']];
 openDialog(`<header class="row"><h2 id="airportCardTitle" tabindex="-1" autofocus>${esc(airportCity(code))} · ${esc(code)}</h2>
  <button type="button" data-action="close" class="icon-button" aria-label="${tr('Закрыть')}">${toolbarIcon('close')}</button></header>
 <p class="muted">${esc(airportName(code))}</p>
 <form id="airportCardForm" class="editor stack">
  <label>${tr('Код IATA')}<input value="${esc(airportIata(code))}" placeholder="—" readonly></label>
  ${flags.map(([key,label])=>`<label class="switch-row"><span><strong>${tr(label)}</strong></span>
   <input type="checkbox" role="switch" name="${key}"${a[key]?' checked':''}><span class="switch-track" aria-hidden="true"></span></label>`).join('')}
  ${parking.map(([key,label])=>`<label>${tr(label)}<textarea name="${key}" rows="2" placeholder="${tr('Номера стоянок, через запятую')}">${esc(a.stands?.[key])}</textarea></label>`).join('')}
  ${airportSceneryDetails(a)}
  <div class="controls"><button type="submit" class="primary">${tr('Сохранить')}</button><button type="button" data-action="close">${tr('Отмена')}</button></div>
 </form>`,'airport');
 const form=byId('airportCardForm');
 form.onsubmit=event=>{
  event.preventDefault();
  const current=airport(code);
  if(!current){byId('dialog').close();return;}
  for(const [key] of flags)current[key]=form.elements[key].checked;
  current.stands??={};
  for(const [key] of parking)current.stands[key]=form.elements[key].value.trim();
  for(const [key] of sceneryFields)current[key]=form.elements[key].value.trim();
  save();
  byId('dialog').close();
  if(page==='airports'){
   airportCode=code;
   airportCountryFilter=catalogCountry(current);
   query='';airportFilter='all';regionFilter='all';
   airportListPage=Math.max(0,Math.floor(filteredAirports().findIndex(item=>item.icao===code)/airportPageSize));
   render();
  }
 };
}

function addAirport() {
 const countries=[...countryContinents.keys()].sort((a,b)=>countryName(a).localeCompare(countryName(b),appLanguage()));
 openDialog(`<h2>${tr("Добавить аэропорт")}</h2>
 <label class="airport-directory">${tr('Мировой справочник')}<input id="airportDirectoryQuery" type="search" autocomplete="off" placeholder="${tr('ICAO, IATA или город')}"></label>
 <div class="airport-directory-results" id="airportDirectoryResults"></div><form id="airportForm" class="editor two">`+
 '<label>ICAO<input name="icao" required minlength="4" maxlength="4" pattern="[A-Za-z]{4}"></label>'+
 '<label>IATA<input name="iata" readonly placeholder="—"></label>'+
 `<label>${tr("Город на русском")}<input name="cityRu" required maxlength="100"></label><label>${tr("Город на английском")}<input name="cityEn" maxlength="100"></label>`+
 `<label>${tr("Название на русском")}<input name="nameRu" required maxlength="160"></label><label>${tr("Название на английском")}<input name="nameEn" maxlength="160"></label>`+
 `<label>${tr("Страна или территория")}<select name="countryCode" required>`+countries.map(code=>option(code,countryName(code),airportCountryFilter)).join('')+'</select></label>'+
 `<label>${tr("Континент")}<select name="continent">`+option('',tr("По стране"),'')+Object.keys(countryGroups).map(c=>option(c,tr(c),'')).join('')+'</select></label>'+
 `<label>${tr("Широта")}<input name="lat" type="number" step="any" min="-90" max="90"></label>`+
 `<label>${tr("Долгота")}<input name="lon" type="number" step="any" min="-180" max="180"></label>`+
 `<p class="full muted">${tr("Координаты можно оставить пустыми. Для отображения аэропорта на карте укажи обе.")}</p>`+
 `<label class="full">${tr('Часовой пояс IANA')}<input name="timezone" maxlength="60" placeholder="Europe/Moscow"></label>`+
 airportSceneryDetails()+
 `<div class="full controls"><button class="primary">${tr("Добавить")}</button><button type="button" data-action="close">${tr("Отмена")}</button></div></form>`);
 const lookup=byId('airportDirectoryQuery'), results=byId('airportDirectoryResults');
 lookup.oninput=()=>{
  const term=lookup.value.trim().toLocaleLowerCase();
  if(term.length<2){results.replaceChildren();return;}
  const matches=[];
  for(const [code,info] of Object.entries(worldwideAirports)){
   if(airport(code))continue;
   const names=[info.cityEn,info.nameEn,airportReference[code]?.cityRu,airportReference[code]?.nameRu];
   const codes=[code.toLowerCase(),airportIata(code).toLowerCase()];
   const score=codes.includes(term)?0:codes.some(value=>value.startsWith(term))?1:
    names.some(value=>value?.toLocaleLowerCase().includes(term))?2:3;
   if(score<3)matches.push({code,info,score});
  }
  results.replaceChildren();
  for(const {code,info} of matches.sort((a,b)=>a.score-b.score).slice(0,12)){
   const button=document.createElement('button');
   button.type='button';
   button.textContent=[code,airportIata(code),airportCity(code),airportName(code)].filter(Boolean).join(' · ');
   button.onclick=()=>{
    const localized=airportReference[code]||{};
    const values={icao:code,iata:airportIata(code),cityRu:localized.cityRu||info.cityEn,cityEn:info.cityEn,
     nameRu:localized.nameRu||info.nameEn,nameEn:info.nameEn,countryCode:info.countryCode,
     lat:info.lat,lon:info.lon,timezone:info.timezone||''};
    for(const [key,value] of Object.entries(values)){
     form.elements[key].value=value;
     form.elements[key].setCustomValidity('');
    }
    lookup.value=button.textContent;
    results.replaceChildren();
   };
   results.append(button);
  }
  if(!results.childElementCount)results.textContent=tr('Аэропорты не найдены.');
 };
 const form=byId('airportForm');
 form.addEventListener('input',event=>{
  for(const field of form.elements)field.setCustomValidity?.('');
  if(event.target===form.elements.icao)form.elements.iata.value=airportIata(event.target.value.trim().toUpperCase());
 });
 form.onsubmit=e=>{
  e.preventDefault();
  const values=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,v.trim()]));
  const icao=values.icao.toUpperCase(), iata=airportIata(icao);
  const errors={icao:airport(icao)?tr("Этот ICAO уже есть в каталоге."):
   iata&&data.airports.some(a=>airportIata(a.icao)===iata)?tr("Этот IATA уже есть в каталоге."):'',
   cityRu:values.cityRu?'':tr("Укажи город."),nameRu:values.nameRu?'':tr("Укажи название аэропорта."),
   lat:values.lat===''&&values.lon!==''?tr("Укажи широту."):'',
   lon:values.lon===''&&values.lat!==''?tr("Укажи долготу."):'',
   timezone:values.timezone&&!validAirportTimezone(values.timezone)?tr('Укажи действительный часовой пояс IANA.'):''};
  const invalid=Object.keys(errors).find(k=>errors[k]);
  if(invalid){form.elements[invalid].setCustomValidity(errors[invalid]);form.reportValidity();return;}
  const {cityRu,cityEn,nameRu,nameEn,countryCode,continent,developer,version,timezone}=values;
  data.airports.push({icao,iata,name:nameRu,country:displayCountries.ru.of(countryCode),countryCode,continent,
   cityRu,cityEn,nameRu,nameEn,lat:values.lat===''?null:Number(values.lat),lon:values.lon===''?null:Number(values.lon),
   developer,version,timezone:timezone||undefined,custom:true,scenery:false,gsx:false,python:false,stands:{narrow:'',wide:''}});
  airportCode=icao;airportCountryFilter=countryCode;query='';airportFilter='all';regionFilter='all';airportListPage=Math.ceil(filteredAirports().length/airportPageSize)-1;
  save();byId('dialog').close();render();
 };
}

const pilotLevels=[
 [0,'Курсант'],[150*60,'Новичок'],[500*60,'Хороший пилот'],[2500*60,'Опытный пилот'],[6000*60+1,'Пенсионер неба']
];
function pilotLevel(minutes){
 const index=pilotLevels.findLastIndex(([threshold])=>minutes>=threshold);
 const current=pilotLevels[Math.max(0,index)];
 const next=pilotLevels[index+1];
 return {rank:current[1],next:next?.[1],progress:next?Math.max(0,(minutes-current[0])/(next[0]-current[0])):1,
  remaining:next?next[0]-minutes:0};
}
const profilePhotoOwner=()=>cloudSession?.user.id;
const validProfilePhoto=photo=>typeof photo==='string'&&photo.length<=240_000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo);
function storeProfilePhoto(photo){
 const p=preferences(), photos={...p.profilePhotos};
 const owner=profilePhotoOwner();
 if(!owner)return;
 if(photo)photos[owner]=photo;
 else delete photos[owner];
 data.preferences={...p,profilePhotos:photos};
}
function profileAvatar(){
 const photo=preferences().profilePhotos?.[profilePhotoOwner()];
 const valid=validProfilePhoto(photo);
 const label=tr(valid?'Изменить фотографию':'Добавить фотографию');
 const editIcon='<path d="m15 5 4 4M4 20l4-.8L20 7a2.8 2.8 0 0 0-4-4L4.8 15z"/>';
 const deleteIcon='<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>';
 const icon=path=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
 return '<div class="pilot-avatar">'+(valid?'<img src="'+esc(photo)+'" alt="">':planeIcon)+
 '<div class="avatar-tools'+(valid?'':' avatar-tools-empty')+'">'+
 '<button type="button" data-action="pick-profile-photo" aria-label="'+label+'" title="'+label+'">'+icon(editIcon)+'</button>'+
 (valid?`<button type="button" data-action="remove-profile-photo" aria-label="${tr('Удалить фотографию')}" title="${tr('Удалить фотографию')}">${icon(deleteIcon)}</button>`:'')+'</div>'+
 '<input id="profilePhotoInput" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden></div>';
}
async function setProfilePhoto(file){
 if(!file)return;
 const owner=profilePhotoOwner();
 try {
  const imageType=['image/jpeg','image/png','image/webp'].includes(file.type)||(!file.type&&/\.(jpe?g|png|webp)$/i.test(file.name));
  if(!imageType||file.size>15_000_000)throw Error();
  const url=URL.createObjectURL(file);
  try {
   const img=new Image();
   img.src=url;
   await img.decode();
   if(owner===profilePhotoOwner())editProfileCrop(img,owner);
  } finally {URL.revokeObjectURL(url);}
 }catch {notice(tr('Не удалось загрузить фотографию. Выбери JPEG, PNG или WebP до 15 МБ.'));}
}
function editProfileCrop(image,owner){
 const {naturalWidth:width,naturalHeight:height}=image;
 openDialog(`<header class="row"><h2 id="photoCropTitle">${tr('Кадрирование фотографии')}</h2>
 <button type="button" class="icon-button" data-action="close" aria-label="${tr('Закрыть')}">${toolbarIcon('close')}</button></header>
 <form id="photoCropForm" class="photo-crop">
  <p class="muted" id="photoCropHint">${tr('Перемещай фото мышью или стрелками. Масштаб меняется ползунком.')}</p>
  <canvas width="320" height="320" tabindex="0" aria-label="${tr('Квадратная область кадрирования')}" aria-describedby="photoCropHint"></canvas>
  <label>${tr('Масштаб')}<input name="zoom" type="range" min="1" max="3" step="0.01" value="1"></label>
  <div class="controls"><button class="primary">${tr('Сохранить фотографию')}</button><button type="button" data-action="close">${tr('Отмена')}</button></div>
 </form>`,'photo-crop');
 const form=byId('photoCropForm'), canvas=form.querySelector('canvas'), ctx=canvas.getContext('2d');
 const zoom=form.elements.zoom, output=canvas.width;
 let x=width/2,y=height/2,drag;
 const edge=()=>Math.min(width,height)/Number(zoom.value);
 function draw(){
  const size=edge(), half=size/2;
  x=Math.min(width-half,Math.max(half,x));
  y=Math.min(height-half,Math.max(half,y));
  ctx.fillStyle='#101722';
  ctx.fillRect(0,0,output,output);
  ctx.drawImage(image,x-half,y-half,size,size,0,0,output,output);
 }
 draw();
 zoom.oninput=draw;
 canvas.onpointerdown=e=>{
  if(e.button!==0||drag)return;
  drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x,y};
  canvas.focus();canvas.setPointerCapture(e.pointerId);
 };
 canvas.onpointermove=e=>{
  if(drag?.id!==e.pointerId)return;
  const scale=edge()/canvas.getBoundingClientRect().width;
  x=drag.x-(e.clientX-drag.startX)*scale;
  y=drag.y-(e.clientY-drag.startY)*scale;
  draw();
 };
 canvas.onlostpointercapture=()=>{drag=null;};
 canvas.onkeydown=e=>{
  const step={ArrowLeft:[1,0],ArrowRight:[-1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];
  if(!step)return;
  e.preventDefault();
  const distance=edge()*(e.shiftKey ? .1 : .025);
  x+=step[0]*distance;y+=step[1]*distance;draw();
 };
 form.onsubmit=e=>{
  e.preventDefault();
  if(owner!==profilePhotoOwner()){byId('dialog').close();return;}
  const photo=canvas.toDataURL('image/jpeg',.85);
  if(!validProfilePhoto(photo)){notice(tr('Не удалось сохранить фотографию.'));return;}
  storeProfilePhoto(photo);
  save();byId('dialog').close();render();
 };
}
function removeProfilePhoto(){
 storeProfilePhoto('');
 save();render();
}
function pilotRankPanel(minutes){
 const {rank,next,progress,remaining}=pilotLevel(minutes);
 return `<section class="panel pilot-rank"><div class="pilot-rank-heading"><span class="pilot-rank-icon">${planeIcon}</span><div><small>${tr('Уровень пилота')}</small><h2>${tr(rank)}</h2></div><strong>${duration(minutes)}</strong></div>
 <div class="rank-track" role="progressbar" aria-label="${tr('Уровень пилота')}" aria-valuenow="${Math.round(progress*100)}"><span style="--rank-progress:${progress*100}%"></span></div>
 <p class="muted">${next?tr('До следующего уровня')+' · '+tr(next)+' · '+duration(remaining):tr('Максимальный уровень достигнут')}</p></section>`;
}

function travelAchievements(rows) {
 const countries=new Map(), continents=new Map();
 for(const f of rows.filter(flown)) {
  const destination=airport(f.arr), code=airportCountry(destination);
  const info=airportInfo(f.arr);
  if(!countryContinents.has(code)) continue;
  const region=destination.continent||(code==='RU'&&info?.lon>=60?'Азия':
   code==='TR'&&f.arr==='LTFM'?'Европа':countryContinents.get(code));
  const end=flightTimes(continuationLeg(f)||f).actualArrival;
  const date=Number.isFinite(end)?new Date(end).toISOString().slice(0,10):f.date;
  for(const [set,key] of [[countries,code],[continents,region]]) {
   if(!set.has(key)||date<set.get(key)) set.set(key,date);
  }
 }
 return {countries,continents};
}

function achievementPanel() {
 const {countries,continents}=travelAchievements(summaryFlights());
 const tile=(title,mark,date)=>'<article class="achievement'+(date?' earned':'')+'"><span class="achievement-mark" aria-hidden="true">'+esc(mark)+'</span><div><strong>'+esc(title)+'</strong><small>'+(date?displayDate(date):tr("Еще не посещен"))+'</small></div></article>';
 const flag=code=>[...code].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join('');
 return `<section class="panel facts"><h2>${tr("Достижения")}</h2><h3>${tr("Континенты ·")} `+continents.size+' / '+Object.keys(countryGroups).length+'</h3>'+
 '<div class="achievement-grid">'+Object.keys(countryGroups).map(r=>tile(tr(r),'✦',continents.get(r))).join('')+'</div>'+
 `<h3 class="facts">${tr("Страны и территории ·")} `+countries.size+' / '+countryContinents.size+'</h3>'+
 (countries.size?'<div class="achievement-grid">'+[...countries].sort(([a],[b])=>countryName(a).localeCompare(countryName(b),appLanguage())).map(([c,date])=>tile(`${tr("Посетил:")} `+countryName(c),flag(c),date)).join('')+'</div>':`<p class="muted">${tr("Достижения появятся после прибытия в пункт назначения.")}</p>`)+'</section>';
}

function dashboardActivity(rows) {
 const dates=Array.from({length:30},(_,i)=>new Date(Date.now()-(29-i)*day).toISOString().slice(0,10));
 const counts=new Map(dates.map(date=>[date,0]));
 for(const f of rows) if(flown(f)&&counts.has(f.date)) counts.set(f.date,counts.get(f.date)+1);
 const max=Math.max(1,...counts.values());
 return `<div class="activity-chart"><div class="activity-tooltip" aria-hidden="true"></div><div class="activity-bars" role="group" aria-label="${tr("Выполнено рейсов за 30 дней:")} `+[...counts.values()].reduce((a,b)=>a+b,0)+'">'+
 [...counts].map(([date,n],index)=>{
  const label=displayDate(date)+' · '+tr('Рейсов:')+' '+n;
  return '<button type="button"'+(index===dates.length-1?'':' tabindex="-1"')+' aria-label="'+label+'" style="--level:'+Math.max(4,n/max*100)+'%"><span></span></button>';
 }).join('')+'</div></div>';
}

function bindActivityChart(){
 const chart=document.querySelector('.activity-chart');
 if(!chart)return;
 const tip=chart.querySelector('.activity-tooltip'), bars=[...chart.querySelectorAll('button')];
 const highlight=bar=>{
  for(const item of bars)item.classList.toggle('active',item===bar);
  if(!bar){tip.classList.remove('visible');return;}
  tip.textContent=bar.getAttribute('aria-label');
  tip.classList.add('visible');
  const box=bar.getBoundingClientRect(), bounds=chart.getBoundingClientRect(), half=tip.offsetWidth/2;
  tip.style.left=Math.max(half,Math.min(bounds.width-half,box.left-bounds.left+box.width/2))+'px';
 };
 chart.addEventListener('pointerover',event=>{const bar=event.target.closest('button');if(bar)highlight(bar);});
 chart.addEventListener('pointerleave',()=>highlight(bars.includes(document.activeElement)?document.activeElement:null));
 chart.addEventListener('focusin',event=>highlight(event.target));
 chart.addEventListener('focusout',event=>{if(!chart.contains(event.relatedTarget))highlight(null);});
 chart.addEventListener('keydown',event=>{
  const offset={ArrowLeft:-1,ArrowRight:1}[event.key];
  if(!offset)return;
  const index=bars.indexOf(event.target), next=bars[index+offset];
  if(!next)return;
  event.preventDefault();
  event.target.tabIndex=-1;next.tabIndex=0;next.focus();
 });
}
// Runs only inside the isolated map iframe. The parent supplies coordinates and style.
function initializeYandexFrame(payload) {
 const send=(message)=>parent.postMessage(message,'*');
 const fail=()=>send('fd-map-failed');
 const select=pan=>window.addEventListener('message',event=>{
  if(event.source!==parent||!Object.hasOwn(payload.points,event.data?.select)) return;
  pan(payload.points[event.data.select]);
 });
 const wireZoom=zoom=>{
  document.getElementById('mapPlus').onclick=()=>zoom(1);
  document.getElementById('mapMinus').onclick=()=>zoom(-1);
 };
 const startV3=async()=>{
  await ymaps3.ready;
  const {YMap,YMapDefaultSchemeLayer,YMapDefaultFeaturesLayer,YMapFeature,YMapMarker}=ymaps3;
  const coordinates=Object.values(payload.points);
  const longitudes=coordinates.map(p=>p[0]),latitudes=coordinates.map(p=>p[1]);
  const bounds=[[Math.min(...longitudes),Math.max(...latitudes)],[Math.max(...longitudes),Math.min(...latitudes)]];
  const map=new YMap(document.getElementById('map'),{
   location:coordinates.length===1?{center:coordinates[0],zoom:8}:{bounds},
   margin:[35,40,40,45],theme:'dark',mode:'vector'
  });
  const color=(tags,value)=>({tags:{all:[tags]},elements:'geometry.fill',stylers:[{color:value}]});
  const scheme=[color('water','#101822'),color('landscape','#23344a'),
   {tags:{any:['poi','transit_location']},elements:'label',stylers:[{visibility:'off'}]}];
  map.addChild(new YMapDefaultSchemeLayer({customization:scheme})).addChild(new YMapDefaultFeaturesLayer());
  for(const coordinates of payload.curves) map.addChild(new YMapFeature({
   geometry:{type:'LineString',coordinates},style:{stroke:[{color:'#a4ddff',width:2}]}
  }));
  for(const [code,coordinates] of Object.entries(payload.points)){
   const marker=document.createElement('button');
   marker.type='button';marker.className='airport-dot '+(code==='UUEE'?'hub':'');
   marker.title=code;marker.setAttribute('aria-label',code);
   marker.onclick=()=>send({airport:code});
   map.addChild(new YMapMarker({coordinates},marker));
  }
  select(center=>map.update({location:{center,duration:300}}));
  wireZoom(step=>map.update({location:{zoom:Math.max(1,Math.min(20,map.zoom+step)),duration:180}}));
  send('fd-map-ready');
 };
 const startV2=()=>{
  const map=new ymaps.Map('map',{center:[50,45],zoom:4,controls:[]});
  map.panes.get('ground')?.getElement().style.setProperty('filter','invert(1) hue-rotate(180deg) saturate(.65)');
  map.behaviors.disable('scrollZoom');
  const normalDot=ymaps.templateLayoutFactory.createClass('<span class="airport-dot legacy"></span>');
  const hubDot=ymaps.templateLayoutFactory.createClass('<span class="airport-dot legacy hub"></span>');
  const toV2=([lon,lat])=>[lat,lon];
  for(const [code,point] of Object.entries(payload.points)){
   const marker=new ymaps.Placemark(toV2(point),{hintContent:code},{
    iconLayout:code==='UUEE'?hubDot:normalDot,iconShape:{type:'Circle',coordinates:[0,0],radius:12}
   });
   marker.events.add('click',()=>send({airport:code}));
   map.geoObjects.add(marker);
  }
  for(const path of payload.paths) map.geoObjects.add(new ymaps.Polyline(path.map(code=>toV2(payload.points[code])),{},
   {strokeColor:'#3785d8',strokeOpacity:.8,strokeWidth:2,geodesic:true}));
  const bounds=map.geoObjects.getBounds();
  if(bounds) map.setBounds(bounds,{checkZoomRange:true,zoomMargin:40});
  select(point=>map.panTo(toV2(point)));
  wireZoom(step=>map.setZoom(Math.max(1,Math.min(19,map.getZoom()+step))));
  send('fd-map-ready');
 };
 const script=document.createElement('script');
 script.src='https://api-maps.yandex.ru/'+(payload.version===3?'v3/':'2.1/')+'?lang='+payload.locale+'&apikey='+encodeURIComponent(payload.key);
 script.onload=()=>{
  if(payload.version===3){startV3().catch(fail);return;}
  try {ymaps.ready(()=>{try{startV2();}catch{fail();}},fail);} catch {fail();}
 };
 script.onerror=fail;
 document.head.append(script);
}

function mountYandexMap() {
 const target=byId('onlineMap');
 if(!target||(!tilesKey&&!mapsKey)) return;
 const status=byId('mapProviderStatus'), fallback=byId('offlineMap');
 const catalog=target.hasAttribute('data-catalog-map');
 const routes=catalog?[]:completedRoutes(summaryFlights()).routes;
 const codes=catalog?data.airports.map(a=>a.icao).filter(code=>hasCoordinates(airportInfo(code))):
  [...new Set(routes.flatMap(r=>r.codes))];
 if(!codes.length)return;
 const points=Object.fromEntries(codes.map(code=>{
  const {lat,lon}=airportInfo(code);
  return [code,[lon,lat]];
 }));
 const paths=routes.map(r=>r.codes);
 const curves=paths.map(path=>greatCircle(...path.map(airportInfo)).map(({lon,lat})=>[lon,lat]));
 const onAirport=code=>catalog?openAirportCard(code):selectMapAirport(code,false);
 if(tilesKey)return mountYandexTiles(target,fallback,status,{points,curves,catalog,onAirport});
 let frame,timer,version;
 const message=e=>{
  if(e.source!==frame?.contentWindow) return;
  if(e.data==='fd-map-ready'){
   clearTimeout(timer);
   target.classList.add('loaded');
   fallback.setAttribute('hidden','');
   status.textContent=tr("Яндекс Карты");
  } else if(e.data==='fd-map-failed') retry();
  else if(typeof e.data?.airport==='string'&&codes.includes(e.data.airport))onAirport(e.data.airport);
 };
 function clearFrame(){
  clearTimeout(timer);frame?.remove();frame=null;
  target.classList.remove('loaded');fallback.removeAttribute('hidden');
 }
 function retry(){
  clearFrame();
  if(version===3){load(2);return;}
  window.removeEventListener('message',message);
  status.textContent=tr("Яндекс Карты недоступны · встроенная карта");
 }
 function load(attempt){
  version=attempt;
  const payload=JSON.stringify({points,paths,curves,key:mapsKey,version,catalog,locale:appLanguage()==='ru'?'ru_RU':'en_US'}).replace(/</g,'\\u003c');
  const colors='#101822;color:#e3f1ff';
  const computed=getComputedStyle(document.body);
  const accent=computed.getPropertyValue('--accent-chip').trim()||'#434e82';
  const light=computed.getPropertyValue('--flight-editor-light').trim()||'140 166 252';
  frame=document.createElement('iframe');
  frame.title=catalog?tr("Карта аэропортов"):tr("Яндекс Карты · карта перелетов");
  frame.setAttribute('sandbox','allow-scripts allow-popups');
  frame.srcdoc='<!doctype html><meta charset=utf-8><style>html,body,#map{width:100%;height:100%;margin:0;background:'+colors+'}'+
   '.airport-dot{display:block;width:13px;height:13px;padding:0;border-radius:50%;border:2px solid #bde6ff;background:#4ba4e7;box-shadow:0 0 0 2px #1c4d8b88;transform:translate(-50%,-50%);cursor:pointer;box-sizing:border-box}'+
   '.airport-dot.hub{width:17px;height:17px;background:#82dded}.airport-dot.legacy{pointer-events:none}'+
   (catalog?'.airport-dot{width:20px;height:20px;border-color:rgb('+light+');background:'+accent+';border-radius:52% 52% 52% 2px;transform:translate(-50%,-86%) rotate(-45deg)}'+
   '.airport-dot::after{content:"";position:absolute;inset:5px;background:#f3f7ff;border-radius:50%}.airport-dot:is(:hover,:focus-visible){background:rgb('+light+')}':'')+
   '.map-zoom{position:absolute;z-index:1000;top:12px;left:12px;display:grid;gap:4px}'+
   '.map-zoom button{width:30px;height:30px;border:1px solid #7597b6;border-radius:8px;font:20px system-ui;background:'+colors+';cursor:pointer}</style>'+
   `<div id=map></div><div class=map-zoom><button id=mapPlus aria-label="${tr("Увеличить")}">+</button><button id=mapMinus aria-label="${tr("Уменьшить")}">−</button></div><script>`+
   '('+initializeYandexFrame.toString()+')('+payload+');<\/script>';
  timer=setTimeout(retry,attempt===3?7000:12000);
  target.append(frame);
 }
 window.addEventListener('message',message);
 status.textContent=tr("Подключение к Яндекс Картам…");
 load(3);
 return ()=>{clearFrame();window.removeEventListener('message',message);};
}

let calendarPopup, calendarAnchor;
function closeCalendar(restoreFocus=false){
 if(calendarPopup?.open)calendarPopup.close();
 calendarPopup?.remove();
 calendarPopup=null;
 if(restoreFocus)calendarAnchor?.focus();
 calendarAnchor?.setAttribute('aria-expanded','false');
 calendarAnchor=null;
}
function openCalendar(anchor,selected,onSelect){
 if(calendarAnchor===anchor){closeCalendar(true);return;}
 closeCalendar();
 calendarAnchor=anchor;
 const today=dateUTC(), initial=selected||today;
 let month=new Date(initial.slice(0,7)+'-01T12:00:00Z');
 const popup=document.createElement('dialog');
 calendarPopup=popup;
 popup.className='calendar-popover';
 popup.setAttribute('aria-label',tr('Календарь'));
 anchor.setAttribute('aria-expanded','true');
 document.body.append(popup);
 popup.showModal();
 popup.addEventListener('cancel',event=>{event.preventDefault();closeCalendar(true);});
 const position=()=>{
  if(!anchor.isConnected){closeCalendar();return;}
  const box=anchor.getBoundingClientRect();
  const top=box.bottom+8+popup.offsetHeight>innerHeight-12?box.top-popup.offsetHeight-8:box.bottom+8;
  popup.style.left=Math.max(10,Math.min(box.left,innerWidth-popup.offsetWidth-10))+'px';
  popup.style.top=Math.max(10,Math.min(top,innerHeight-popup.offsetHeight-10))+'px';
 };
 function draw(focus){
  popup.replaceChildren();
  const header=document.createElement('header');
  const title=document.createElement('strong');
  title.textContent=new Intl.DateTimeFormat(appLanguage(),{month:'long',year:'numeric',timeZone:'UTC'}).format(month);
  const button=(label,action,accessibleLabel=label)=>{
   const b=document.createElement('button');
   b.type='button';b.textContent=label;b.setAttribute('aria-label',accessibleLabel);b.onclick=action;
   return b;
  };
  const move=delta=>()=>{month.setUTCMonth(month.getUTCMonth()+delta);draw(true);};
  header.append(button('‹',move(-1),tr('Предыдущий месяц')),title,button('›',move(1),tr('Следующий месяц')));
  const grid=document.createElement('div');
  grid.className='calendar-days';
  const weekdayFormatter=new Intl.DateTimeFormat(appLanguage(),{weekday:'short',timeZone:'UTC'});
  for(let i=0;i<7;i++){
   const label=document.createElement('small');
   label.textContent=weekdayFormatter.format(Date.UTC(2024,0,i+1));
   grid.append(label);
  }
  const mondayOffset=(month.getUTCDay()+6)%7;
  for(let i=0;i<42;i++){
   const date=new Date(month.getTime()+(i-mondayOffset)*day);
   const iso=date.toISOString().slice(0,10);
   const control=button(String(date.getUTCDate()),()=>{closeCalendar(true);onSelect(iso);},displayDate(iso));
   control.classList.toggle('other-month',date.getUTCMonth()!==month.getUTCMonth());
   control.classList.toggle('today',iso===today);
   control.setAttribute('aria-pressed',String(iso===selected));
   grid.append(control);
  }
  popup.append(header,grid,button(tr('Сегодня'),()=>{closeCalendar(true);onSelect(today);}));
  position();
  if(focus)(grid.querySelector('[aria-pressed=true]')||header.querySelector('button'))?.focus();
 }
 draw(true);
}
document.addEventListener('pointerdown',event=>{
 if(!calendarPopup)return;
 const box=calendarPopup.getBoundingClientRect();
 if(!calendarPopup.contains(event.target)||(event.target===calendarPopup&&
  (event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))){
  event.preventDefault();
  closeCalendar(true);
 }
},true);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&calendarPopup){event.preventDefault();event.stopPropagation();closeCalendar(true);}
},true);
window.addEventListener('resize',()=>closeCalendar());

function closeSettings(after){
 const dialog=byId('dialog');
 if(dialog.dataset.layout!=='settings'||!dialog.open)return;
 const finish=()=>{
  if(dialog.dataset.layout!=='settings'||!dialog.open)return;
  dialog.classList.remove('settings-closing');
  dialog.close();
  after?.();
 };
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
 if(dialog.classList.contains('settings-closing'))return;
 dialog.classList.add('settings-closing');
 setTimeout(finish,180);
}
byId('dialog').addEventListener('click',event=>{
 const dialog=event.currentTarget;
 if(dialog.dataset.layout!=='settings'||event.target!==dialog)return;
 const box=dialog.getBoundingClientRect();
 if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeSettings();
});
byId('dialog').addEventListener('cancel',event=>{
 if(event.currentTarget.dataset.layout==='settings'){event.preventDefault();closeSettings();}
});
