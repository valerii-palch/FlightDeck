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
 const settings={profileName:'Валерий Вахрушев',startPage:'home',density:'normal',theme:'system',mapProvider:'yandex',includeDemo:false,...data.preferences};
 if(settings.mapProvider==='google') settings.mapProvider='yandex';
 return settings;
};
const summaryFlights=()=>preferences().includeDemo?data.flights:data.flights.filter(f=>!f.demo);
const themes=[['light','Светлая'],['dark','Темная'],['system','Системная']];
const systemLight=window.matchMedia?.('(prefers-color-scheme: light)');
const applyTheme=()=>{
 const theme=preferences().theme;
 document.documentElement.dataset.theme=theme==='light'||theme==='dark'?theme:systemLight?.matches?'light':'dark';
};
function refreshMapTheme(){
 applyTheme();
 mapCleanup?.();
 mapCleanup=mountYandexMap();
}
systemLight?.addEventListener('change',()=>{if(preferences().theme==='system') refreshMapTheme();});
let mapsKey='';
try {mapsKey=localStorage.getItem('flightdeck.yandexMapsKey')||'';} catch {}
if(typeof window.flightDeckMapsKey==='string') mapsKey=window.flightDeckMapsKey;
const mapKeyPattern=/^[A-Za-z0-9_-]{20,120}$/;

function editSettings() {
 const p=preferences();
 const preview=variant=>'<span class="theme-mini theme-mini-'+variant+'" aria-hidden="true"><i></i><i></i><i></i></span>';
 openDialog(`<header class="settings-header"><div><h2>${tr("Настройки")}</h2><p class="muted">${tr("Оформление, карта и данные FlightDeck")}</p></div><button class="icon-button" data-action="close" aria-label="${tr("Закрыть настройки")}" autofocus>`+toolbarIcon('close')+'</button></header>'+
 '<form id="settingsForm" class="settings-layout">'+
 `<fieldset class="settings-section theme-settings"><legend>${tr("Оформление")}</legend><div class="theme-options">`+themes.map(([key,label])=>
 '<label class="theme-option"><input type="radio" name="theme" value="'+key+'" '+(p.theme===key?'checked':'')+'><span class="theme-card"><span class="theme-preview">'+
 (key==='system'?preview('light')+preview('dark'):preview(key))+'</span><span class="theme-label">'+tr(label)+'</span></span></label>').join('')+'</div></fieldset>'+
 '<fieldset class="settings-section"><legend>'+tr('Язык')+'</legend><select aria-label="'+tr('Язык')+'" name="language">'+
 languageOptions.map(([key,label])=>option(key,tr(label),languagePreference)).join('')+'</select></fieldset>'+
 `<fieldset class="settings-section"><legend>${tr("Профиль и журнал")}</legend><div class="settings-fields">`+
 `<label>${tr("Имя в профиле")}<input name="profileName" required maxlength="80" value="`+esc(p.profileName)+'"></label>'+
 `<label>${tr("Стартовый экран")}<select name="startPage">`+pages.map(([k,v])=>option(k,tr(v),p.startPage)).join('')+'</select></label>'+
 '<label>'+tr('Плотность журнала')+'<select name="density">'+option('normal',tr("Обычная"),p.density)+option('compact',tr("Компактная"),p.density)+'</select></label>'+
 `<label class="switch-row"><span>${tr("Учитывать демо в сводке и на карте")}</span><input type="checkbox" role="switch" name="includeDemo" `+(p.includeDemo?'checked':'')+'><span class="switch-track" aria-hidden="true"></span></label></div></fieldset>'+
 `<fieldset class="settings-section"><legend>${tr("Карта")}</legend><div class="settings-fields">`+
 `<label>${tr("Источник")}<select name="mapProvider">`+option('offline',tr("Встроенная"),p.mapProvider)+option('yandex',tr("Яндекс Карты"),p.mapProvider)+'</select></label>'+
 `<label>${tr("Ключ JavaScript API Яндекс Карт")}<input name="mapsKey" type="password" autocomplete="off" value="`+esc(mapsKey)+'"></label></div>'+
 `<p class="muted">${tr("Без ключа или интернета используется встроенная карта. Ключ хранится отдельно от резервной копии.")}</p></fieldset>`+
 `<div class="settings-actions controls"><button type="button" data-action="update">${tr("Обновить приложение")}</button><button type="button" data-action="tour">${tr("Повторить обучение")}</button><button type="button" data-action="feedback">${tr("Обратная связь")}</button><button type="button" data-action="backup">${tr("Резервная копия")}</button><button class="primary">${tr("Сохранить")}</button></div>`+
 '<div class="settings-credit">'+appCredit+'</div></form>');
 const form=byId('settingsForm');
 form.addEventListener('change',e=>{
  if(e.target.name!=='theme') return;
  data.preferences={...preferences(),theme:e.target.value};
  refreshMapTheme();save();
 });
 form.elements.mapsKey.addEventListener('input',()=>form.elements.mapsKey.setCustomValidity(''));
 form.onsubmit=e=>{
  e.preventDefault();
  const {mapsKey:key,language,...settings}=Object.fromEntries(new FormData(form));
  const clean=key.trim();
  if (clean&&!mapKeyPattern.test(clean)) {
   form.elements.mapsKey.setCustomValidity(tr("Проверь формат ключа JavaScript API Яндекс Карт."));
   form.reportValidity();return;
  }
  mapsKey=clean;
  const native=window.webkit?.messageHandlers?.saveMapsKey;
  if(native) native.postMessage(clean);
  else try {localStorage.setItem('flightdeck.yandexMapsKey',clean);} catch {notice(tr("Ключ действует до закрытия этой вкладки."));}
  data.preferences={...settings,includeDemo:settings.includeDemo==='on',profileName:settings.profileName.trim()||'Валерий Вахрушев'};
  saveLanguage(language);
  save();byId('dialog').close();render();
 };
}

function addAirport() {
 const countries=[...countryContinents.keys()].sort((a,b)=>countryName(a).localeCompare(countryName(b),appLanguage()));
 openDialog(`<h2>${tr("Добавить аэропорт")}</h2><form id="airportForm" class="editor two">`+
 '<label>ICAO<input name="icao" required minlength="4" maxlength="4" pattern="[A-Za-z]{4}"></label>'+
 '<label>IATA<input name="iata" maxlength="3" pattern="[A-Za-z]{3}"></label>'+
 `<label>${tr("Город на русском")}<input name="cityRu" required maxlength="100"></label><label>${tr("Город на английском")}<input name="cityEn" maxlength="100"></label>`+
 `<label>${tr("Название на русском")}<input name="nameRu" required maxlength="160"></label><label>${tr("Название на английском")}<input name="nameEn" maxlength="160"></label>`+
 `<label>${tr("Страна или территория")}<select name="countryCode" required>`+countries.map(code=>option(code,countryName(code),airportCountryFilter)).join('')+'</select></label>'+
 `<label>${tr("Континент")}<select name="continent">`+option('',tr("По стране"),'')+Object.keys(countryGroups).map(c=>option(c,tr(c),'')).join('')+'</select></label>'+
 `<label>${tr("Широта")}<input name="lat" type="number" step="any" min="-90" max="90"></label>`+
 `<label>${tr("Долгота")}<input name="lon" type="number" step="any" min="-180" max="180"></label>`+
 `<p class="full muted">${tr("Координаты можно оставить пустыми. Для отображения аэропорта на карте укажи обе.")}</p>`+
 `<div class="full controls"><button class="primary">${tr("Добавить")}</button><button type="button" data-action="close">${tr("Отмена")}</button></div></form>`);
 const form=byId('airportForm');
 form.addEventListener('input',()=>Array.from(form.elements).forEach(f=>f.setCustomValidity?.('')));
 form.onsubmit=e=>{
  e.preventDefault();
  const values=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,v.trim()]));
  const icao=values.icao.toUpperCase(), iata=values.iata.toUpperCase();
  const errors={icao:airport(icao)?tr("Этот ICAO уже есть в каталоге."):'',
   iata:iata&&data.airports.some(a=>a.iata===iata)?tr("Этот IATA уже есть в каталоге."):'',
   cityRu:values.cityRu?'':tr("Укажи город."),nameRu:values.nameRu?'':tr("Укажи название аэропорта."),
   lat:values.lat===''&&values.lon!==''?tr("Укажи широту."):'',
   lon:values.lon===''&&values.lat!==''?tr("Укажи долготу."):''};
  const invalid=Object.keys(errors).find(k=>errors[k]);
  if(invalid){form.elements[invalid].setCustomValidity(errors[invalid]);form.reportValidity();return;}
  const {cityRu,cityEn,nameRu,nameEn,countryCode,continent}=values;
  data.airports.push({icao,iata,name:nameRu,country:displayCountries.ru.of(countryCode),countryCode,continent,
   cityRu,cityEn,nameRu,nameEn,lat:values.lat===''?null:Number(values.lat),lon:values.lon===''?null:Number(values.lon),
   custom:true,scenery:false,gsx:false,python:false,stands:{narrow:'',wide:''}});
  airportCode=icao;airportCountryFilter=countryCode;query='';airportFilter='all';regionFilter='all';airportListPage=Math.ceil(filteredAirports().length/airportPageSize)-1;
  save();byId('dialog').close();render();
 };
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
 const tile=(title,mark,date)=>'<article class="achievement'+(date?' earned':'')+'"><span class="achievement-mark" aria-hidden="true">'+esc(mark)+'</span><div><strong>'+esc(title)+'</strong><small>'+esc(date||tr("Еще не посещен"))+'</small></div></article>';
 const flag=code=>[...code].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join('');
 return `<section class="panel facts"><h2>${tr("Достижения")}</h2><h3>${tr("Континенты ·")} `+continents.size+' / '+Object.keys(countryGroups).length+'</h3>'+
 '<div class="achievement-grid">'+Object.keys(countryGroups).map(r=>tile(tr(r),'✦',continents.get(r))).join('')+'</div>'+
 `<h3 class="facts">${tr("Страны и территории ·")} `+countries.size+' / '+countryContinents.size+'</h3>'+
 (countries.size?'<div class="achievement-grid">'+[...countries].sort(([a],[b])=>countryName(a).localeCompare(countryName(b),appLanguage())).map(([c,date])=>tile(`${tr("Посетил:")} `+countryName(c),flag(c),date)).join('')+'</div>':`<p class="muted">${tr("Достижения появятся после прибытия в пункт назначения.")}</p>`)+'</section>';
}

function dashboardActivity() {
 const dates=Array.from({length:30},(_,i)=>new Date(Date.now()-(29-i)*day).toISOString().slice(0,10));
 const counts=new Map(dates.map(date=>[date,0]));
 for(const f of summaryFlights().filter(flown)) if(counts.has(f.date)) counts.set(f.date,counts.get(f.date)+1);
 const max=Math.max(1,...counts.values());
 return `<div class="activity-bars" role="img" aria-label="${tr("Выполнено рейсов за 30 дней:")} `+[...counts.values()].reduce((a,b)=>a+b,0)+'">'+
 [...counts].map(([date,n])=>'<span title="'+date+' · '+n+'" style="--level:'+Math.max(4,n/max*100)+'%"></span>').join('')+'</div>';
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
   margin:[35,40,40,45],theme:payload.theme,mode:'vector'
  });
  const dark=payload.theme==='dark';
  const color=(tags,value)=>({tags:{all:[tags]},elements:'geometry.fill',stylers:[{color:value}]});
  const scheme=[color('water',dark?'#101d2e':'#cbe2f6'),color('landscape',dark?'#23384d':'#e8f1f8'),
   {tags:{any:['poi','transit_location']},elements:'label',stylers:[{visibility:'off'}]}];
  map.addChild(new YMapDefaultSchemeLayer({customization:scheme})).addChild(new YMapDefaultFeaturesLayer());
  for(const coordinates of payload.curves) map.addChild(new YMapFeature({
   geometry:{type:'LineString',coordinates},style:{stroke:[{color:dark?'#78c5f8':'#2466aa',width:2}]}
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
 if(!target||preferences().mapProvider!=='yandex') return;
 const status=byId('mapProviderStatus'), fallback=byId('offlineMap');
 if(!mapKeyPattern.test(mapsKey)){
  status.textContent=tr("Встроенная карта · ключ Яндекс Карт можно добавить в настройках");
  return;
 }
 const {routes}=completedRoutes(summaryFlights());
 if(!routes.length) return;
 const codes=[...new Set(routes.flatMap(r=>r.codes))];
 const points=Object.fromEntries(codes.map(code=>{
  const {lat,lon}=airportInfo(code);
  return [code,[lon,lat]];
 }));
 const paths=routes.map(r=>r.codes);
 const curves=paths.map(path=>greatCircle(...path.map(airportInfo)).map(({lon,lat})=>[lon,lat]));
 let frame,timer,version;
 const message=e=>{
  if(e.source!==frame?.contentWindow) return;
  if(e.data==='fd-map-ready'){
   clearTimeout(timer);
   target.classList.add('loaded');
   fallback.setAttribute('hidden','');
   status.textContent=tr("Яндекс Карты");
  } else if(e.data==='fd-map-failed') retry();
  else if(typeof e.data?.airport==='string'&&codes.includes(e.data.airport)) selectMapAirport(e.data.airport,false);
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
  const theme=document.documentElement.dataset.theme==='light'?'light':'dark';
  const payload=JSON.stringify({points,paths,curves,key:mapsKey,theme,version,locale:appLanguage()==='ru'?'ru_RU':'en_US'}).replace(/</g,'\\u003c');
  const colors=theme==='dark'?'#15283d;color:#e3f1ff':'#eff6ff;color:#23435e';
  frame=document.createElement('iframe');
  frame.title=tr("Яндекс Карты · карта перелетов");
  frame.setAttribute('sandbox','allow-scripts allow-popups');
  frame.srcdoc='<!doctype html><meta charset=utf-8><style>html,body,#map{width:100%;height:100%;margin:0;background:'+colors+'}'+
   '.airport-dot{display:block;width:13px;height:13px;padding:0;border-radius:50%;border:2px solid #bde6ff;background:#4ba4e7;box-shadow:0 0 0 2px #1c4d8b88;transform:translate(-50%,-50%);cursor:pointer;box-sizing:border-box}'+
   '.airport-dot.hub{width:17px;height:17px;background:#82dded}.airport-dot.legacy{pointer-events:none}'+
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
