const airportReference = JSON.parse(byId('airport-reference').textContent);
const worldwideAirports=JSON.parse(byId('worldwide-airports').textContent);
const airportIata = code => [airportReference[code]?.iata,worldwideAirports[code]?.iata,airport(code)?.iata,data.airportHistory?.[code]?.iata]
 .find(value=>typeof value==='string'&&/^[A-Z]{3}$/.test(value))||'';
const airportInfo = code => {
 const entry=airport(code)||data.airportHistory?.[code], base=airportReference[code], world=worldwideAirports[code];
 return entry||base||world?{...world,...base,...entry,iata:airportIata(code)}:undefined;
};
const airportCity = code => {
 const info = airportInfo(code);
 return (appLanguage()==='en'?info?.cityEn:info?.cityRu)||info?.cityRu||info?.cityEn||info?.name||code;
};
const airportName = code => {
 const info = airportInfo(code);
 return (appLanguage()==='en'?info?.nameEn:info?.nameRu)||info?.nameRu||info?.nameEn||info?.name||code;
};
const hasCoordinates = info => Number.isFinite(info?.lat)&&Math.abs(info.lat)<=90&&Number.isFinite(info.lon)&&Math.abs(info.lon)<=180;
let selectedMapAirport = '';

function completedRoutes(flights) {
 const routes = new Map();
 let unmapped = 0;
 for (const f of flights.filter(f=>isDiversion(f)?alternateLanded(f):legFlown(f))) {
  const destination=f.arr;
  if (!hasCoordinates(airportInfo(f.dep)) || !hasCoordinates(airportInfo(destination))) {
   unmapped++;
   continue;
  }
  const codes = [f.dep,destination].sort();
  const key = codes.join('/');
  const route = routes.get(key) || {codes,count:0};
  route.count++;
  routes.set(key,route);
 }
 return {routes:[...routes.values()],unmapped};
}

const rad = degrees => degrees * Math.PI / 180;
const deg = radians => radians * 180 / Math.PI;
const wrapLon = (lon,center=0) => ((lon-center+180)%360+360)%360-180+center;

function greatCircle(from,to) {
 const vector = ({lat,lon}) => [Math.cos(rad(lat))*Math.cos(rad(lon)),Math.cos(rad(lat))*Math.sin(rad(lon)),Math.sin(rad(lat))];
 const a = vector(from), b = vector(to);
 const angle = Math.acos(Math.max(-1,Math.min(1,a.reduce((sum,value,i)=>sum+value*b[i],0))));
 if (angle < .00001 || Math.abs(Math.sin(angle))<.00001) return [from,to];
 return Array.from({length:33},(_,i)=>{
  const t = i/32;
  const [x,y,z] = a.map((value,j)=>value*Math.sin((1-t)*angle)+b[j]*Math.sin(t*angle));
  return {lon:deg(Math.atan2(y,x)),lat:deg(Math.atan2(z,Math.hypot(x,y)))};
 });
}

function routeProjection(points) {
 const longitudes = points.map(p=>wrapLon(p.lon)).sort((a,b)=>a-b);
 let west = longitudes[0], east = longitudes.at(-1);
 let gap = 360+west-east;
 for (let i=1;i<longitudes.length;i++) {
  if (longitudes[i]-longitudes[i-1]<=gap) continue;
  gap = longitudes[i]-longitudes[i-1];
  west = longitudes[i];
  east = longitudes[i-1]+360;
 }
 const centerLon = (west+east)/2;
 const latitudes = points.map(p=>p.lat);
 const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
 const centerLat = (minLat+maxLat)/2;
 const longitudeScale = Math.max(.36,Math.cos(rad(centerLat)));
 const width = 940, height = 396, padding = 47;
 const scale = Math.min((width-2*padding)/Math.max((east-west)*longitudeScale,12),
  (height-2*padding)/Math.max(maxLat-minLat,9));
 return {
  width,height,centerLon,worldWidth:360*longitudeScale*scale,
  project: ({lon,lat}) => [(lon-centerLon)*longitudeScale*scale+width/2,(centerLat-lat)*scale+height/2]
 };
}

// The built-in chart uses generalized coastlines. Airport positions use reference coordinates.
const landOutlines = [
 [[-168,65],[-163,60],[-150,59],[-140,60],[-133,55],[-129,50],[-125,49],[-124,42],[-118,33],[-113,28],[-107,23],[-99,19],[-91,19],[-87,21],[-88,16],[-83,10],[-79,9],[-77,8],[-80,14],[-84,19],[-86,22],[-90,29],[-84,30],[-81,25],[-80,33],[-75,37],[-70,44],[-61,47],[-58,52],[-65,58],[-78,63],[-89,64],[-95,69],[-108,68],[-116,72],[-130,71],[-142,70],[-157,71],[-168,67]],
 [[-81,8],[-77,1],[-80,-5],[-74,-15],[-70,-20],[-72,-33],[-74,-44],[-67,-55],[-62,-50],[-64,-43],[-56,-37],[-50,-28],[-46,-23],[-39,-15],[-35,-7],[-42,-3],[-50,1],[-57,6],[-62,9],[-70,11],[-75,10]],
 [[-53,60],[-61,66],[-65,75],[-57,81],[-36,83],[-21,81],[-18,75],[-22,68],[-34,65],[-43,60]],
 [[-10,36],[-10,43],[-5,48],[3,51],[8,54],[14,54],[22,57],[25,60],[29,66],[32,70],[40,68],[50,69],[61,70],[70,74],[82,72],[94,76],[109,74],[122,73],[140,72],[154,72],[171,70],[190,66],[179,62],[165,59],[163,55],[157,51],[155,58],[146,59],[139,54],[137,47],[131,42],[129,36],[125,39],[120,36],[122,31],[119,25],[113,21],[108,22],[107,16],[109,11],[105,9],[101,13],[100,8],[104,2],[103,1],[99,6],[97,15],[94,19],[90,22],[86,20],[81,14],[78,8],[74,15],[71,21],[67,24],[60,25],[56,27],[54,25],[51,21],[48,14],[43,13],[43,17],[40,22],[36,28],[34,30],[35,34],[30,36],[26,40],[22,39],[19,42],[15,45],[13,44],[16,39],[12,38],[10,43],[5,43],[0,40],[-2,36]],
 [[-17,15],[-16,22],[-10,28],[-6,35],[1,37],[12,36],[19,33],[29,31],[33,31],[36,23],[42,13],[51,11],[48,4],[42,-2],[40,-10],[36,-17],[35,-23],[31,-29],[25,-34],[18,-35],[15,-29],[12,-20],[13,-11],[9,-3],[8,4],[0,5],[-7,4],[-12,8],[-17,12]],
 [[-10,50],[-6,49],[-2,51],[1,53],[-2,56],[-5,59],[-8,58],[-7,54],[-10,55],[-11,52]],
 [[4,58],[7,62],[12,66],[19,70],[29,71],[28,66],[24,61],[18,58],[15,56],[12,57],[10,60],[7,58]],
 [[-24,64],[-22,66],[-15,67],[-13,65],[-17,63],[-23,63]],
 [[130,31],[134,34],[139,35],[142,39],[140,42],[145,45],[146,42],[143,36],[139,33],[135,32]],
 [[120,18],[123,18],[124,14],[127,9],[124,6],[121,11],[119,15]],
 [[95,6],[99,3],[104,-2],[106,-6],[102,-5],[98,-1]],
 [[108,7],[115,7],[119,2],[118,-3],[113,-4],[108,-1]],
 [[105,-6],[113,-7],[122,-8],[128,-8],[123,-10],[113,-9],[106,-8]],
 [[130,-1],[139,-3],[146,-5],[151,-10],[145,-10],[140,-8],[135,-6]],
 [[113,-23],[116,-20],[122,-18],[129,-15],[135,-12],[140,-17],[143,-12],[147,-17],[152,-24],[154,-29],[150,-35],[146,-39],[140,-38],[134,-34],[125,-34],[116,-35],[113,-30]],
 [[166,-46],[170,-42],[174,-40],[176,-36],[174,-34],[179,-38],[177,-42],[171,-46]],
 [[49,-12],[51,-16],[49,-22],[45,-26],[43,-23],[45,-17]],
 [[-85,23],[-81,23],[-75,21],[-74,20],[-80,21],[-84,21]]
];

function coastlines(chart) {
 return landOutlines.flatMap(outline=>{
  const shape = outline.map(([lon,lat])=>chart.project({lon:wrapLon(outline[0][0],chart.centerLon)+lon-outline[0][0],lat}));
  return [-1,0,1].map(copy=>'<polygon points="'+shape.map(([x,y])=>(x+copy*chart.worldWidth).toFixed(1)+','+y.toFixed(1)).join(' ')+'"/>');
 }).join('');
}

function mapAirportSummary(code) {
 const info = airportInfo(code);
 if (!info) return '';
 const city = airportCity(code), name = airportName(code);
 return '<span class="map-airport-heading">'+codeLabel(code)+' <strong>'+esc(city)+'</strong></span>'+
  (name===city?'':'<span class="map-airport-name muted">'+esc(name)+'</span>');
}

function routeMap() {
 const {routes,unmapped} = completedRoutes(summaryFlights());
 if (!routes.length) return `<section class="panel facts route-map"><h2>${tr("Карта перелетов")}</h2><p class="muted">${tr("Пока нет выполненных перелетов с известными аэропортами.")}</p></section>`;
 const codes = [...new Set(routes.flatMap(r=>r.codes))].sort(compareAirports);
 if (!codes.includes(selectedMapAirport)) selectedMapAirport = codes[0];
 const paths = routes.map(r=>greatCircle(...r.codes.map(airportInfo)));
 const chart = routeProjection(paths.flat());
 const point = p => chart.project({...p,lon:wrapLon(p.lon,chart.centerLon)});
 const segment = (a,b) => chart.project(a).map(n=>n.toFixed(1)).join(',')+' '+chart.project(b).map(n=>n.toFixed(1)).join(',');
 const grid = Array.from({length:19},(_,i)=>i*20-180).map(lon=>{
  const wrapped = wrapLon(lon,chart.centerLon);
  return segment({lon:wrapped,lat:-90},{lon:wrapped,lat:90});
 }).concat(Array.from({length:9},(_,i)=>i*20-80).map(lat=>segment({lon:chart.centerLon-180,lat},{lon:chart.centerLon+180,lat})));
 const lines = paths.map((path,i)=>{
  let previous = null;
  const commands = path.map(p=>{
   const [x,y] = point(p);
   const move = previous===null || Math.abs(x-previous)>chart.worldWidth/2;
   previous = x;
   return (move?'M':'L')+x.toFixed(1)+' '+y.toFixed(1);
  }).join(' ');
  return '<path style="--route-width:'+Math.min(3.2,1+Math.log2(routes[i].count)*.45)+'" d="'+commands+'"><title>'+routes[i].codes.join(' ↔ ')+' · '+routes[i].count+'</title></path>';
 }).join('');
 const markers = codes.map(code=>{
  const info = airportInfo(code);
  const [x,y] = point(info);
  return '<g data-map-airport="'+code+'" class="map-airport hub-'+hubLevel(airport(code))+(code===selectedMapAirport?' selected':'')+'" transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+')"><title>'+code+' · '+esc(airportCity(code))+'</title><circle r="10" class="map-hit"/><circle r="'+(hubLevel(airport(code))?5:3.3)+'" class="map-point"/></g>';
 }).join('');
 return `<section class="panel facts route-map"><div class="row map-heading"><h2>${tr("Карта перелетов")}</h2><small>`+codes.length+` ${tr("аэродромов ·")} `+routes.length+` ${tr("направлений")}</small></div>`+
 '<p id="mapProviderStatus" class="map-provider muted"></p><div id="onlineMap" class="online-map"></div><svg id="offlineMap" class="map-chart" viewBox="0 0 '+chart.width+' '+chart.height+`" role="img" aria-label="${tr("Карта аэропортов и выполненных перелетов")}"><g class="map-land">`+coastlines(chart)+'</g><g class="map-grid">'+grid.map(g=>'<polyline points="'+g+'"/>').join('')+'</g><g class="map-lines">'+lines+'</g>'+markers+'</svg>'+
 `<div class="map-footer"><label>${tr("Аэропорт")}<select id="mapAirport">`+codes.map(code=>option(code,(hubLabel(airport(code))?hubLabel(airport(code))+' · ':'')+code+' · '+airportCity(code),selectedMapAirport)).join('')+'</select></label><p class="map-airport-summary" id="mapAirportSummary">'+mapAirportSummary(selectedMapAirport)+'</p><a class="map-link" id="yandexAirportLink" href="'+esc(yandexAirportURL(selectedMapAirport))+`" target="_blank" rel="noopener noreferrer">${tr("Открыть в Яндекс Картах ↗")}</a></div>`+
 `<small class="map-note">${tr("Дуги соединяют аэропорты по журналу. Фактические траектории не записываются.")}`+(unmapped?` ${tr("Перелетов без подтвержденных аэропортов:")} `+unmapped+'.':'')+'</small></section>';
}

function yandexAirportURL(code){
 const info=airportInfo(code);
 return hasCoordinates(info)?'https://yandex.ru/maps/?ll='+info.lon+','+info.lat+'&z=11':'https://yandex.ru/maps/';
}

function selectMapAirport(code, pan=true) {
 if (!airportInfo(code) || !byId('mapAirport')) return;
 selectedMapAirport = code;
 byId('mapAirport').value = code;
 byId('yandexAirportLink').href=yandexAirportURL(code);
 byId('mapAirportSummary').innerHTML = mapAirportSummary(code);
 if(pan){
  const map=byId('onlineMap');
  map?.dispatchEvent(new CustomEvent('fd-map-select',{detail:code}));
  map?.querySelector('iframe')?.contentWindow?.postMessage({select:code},'*');
 }
 document.querySelectorAll('[data-map-airport]').forEach(marker=>marker.classList.toggle('selected',marker.dataset.mapAirport===code));
}

function catalogAirportMap(){
 const codes=orderedAirports().map(a=>a.icao).filter(code=>hasCoordinates(airportInfo(code)));
 if(!codes.length)return '';
 const chart=routeProjection(codes.map(airportInfo));
 return `<section class="panel airport-catalog-map"><div class="row map-heading"><h2>${tr('Карта аэропортов')}</h2><small id="mapProviderStatus"></small></div>
  <div id="onlineMap" class="online-map" data-catalog-map></div>
  <svg id="offlineMap" class="map-chart" viewBox="0 0 ${chart.width} ${chart.height}" role="group" aria-label="${tr('Карта аэропортов')}">
  <g class="map-land">${coastlines(chart)}</g>${codes.map(code=>{
   const info=airportInfo(code), [x,y]=chart.project({...info,lon:wrapLon(info.lon,chart.centerLon)});
   return `<g class="catalog-pin hub-${hubLevel(airport(code))}" role="button" tabindex="0" data-catalog-pin="${esc(code)}" aria-label="${esc(code+' · '+airportCity(code))}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <title>${esc(code+' · '+airportCity(code))}</title><path d="M0 0C-2-4-7-7-7-12a7 7 0 1 1 14 0C7-7 2-4 0 0Z"/><circle cy="-12" r="2.5"/></g>`;
  }).join('')}</svg></section>`;
}
