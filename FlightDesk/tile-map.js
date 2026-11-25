// The tile service provides the basemap. FlightDeck draws its own journal overlays.
function tileMapPoint([lon,lat]){
 const angle=rad(Math.max(-85.05112878,Math.min(85.05112878,lat)));
 return [(lon+180)/360,.5-Math.asinh(Math.tan(angle))/(2*Math.PI)];
}

function mountYandexTiles(target,fallback,status,{points,curves,catalog,onAirport}){
 const locale=appLanguage()==='ru'?'ru_RU':'en_US';
 const locations=Object.fromEntries(Object.entries(points).map(([code,point])=>[code,tileMapPoint(point)]));
 const origin=routeProjection(Object.values(points).map(([lon,lat])=>({lon,lat}))).centerLon;
 const xs=Object.values(points).map(([lon])=>(wrapLon(lon,origin)+180)/360);
 const ys=Object.values(locations).map(([,y])=>y);
 const centerX=(Math.min(...xs)+Math.max(...xs))/2,centerY=(Math.min(...ys)+Math.max(...ys))/2;
 const paths=curves.map(path=>path.map(tileMapPoint));
 const markers=new Map();
 const size=256;
 const tileImage=new Map();
 const tileHost=document.createElement('div');
 tileHost.className='yandex-tile-map';
 tileHost.setAttribute('role','group');
 tileHost.setAttribute('aria-label',tr(catalog?'Карта аэропортов':'Карта перелетов'));
 tileHost.innerHTML='<div class="tile-map-layer"><div class="tile-map-pictures"></div>'+
  '<svg aria-hidden="true" class="tile-map-routes"></svg><div class="tile-map-markers"></div></div>'+
  '<div class="tile-map-zoom"></div><a class="tile-map-credit" href="https://yandex.ru/maps/" target="_blank" rel="noopener noreferrer">'+
  '<img alt="Яндекс Карты" src="data:image/png;base64,__YANDEX_TILE_LOGO__"></a>';
 target.append(tileHost);
 const layer=tileHost.querySelector('.tile-map-layer'), pictures=tileHost.querySelector('.tile-map-pictures');
 const lines=tileHost.querySelector('.tile-map-routes'), pins=tileHost.querySelector('.tile-map-markers');
 const zoomControls=tileHost.querySelector('.tile-map-zoom');
 let x=centerX,y=centerY,z, gesture, ready=false, stopped=false, drawTimer, waitTimer, queueTimer, pending=[];
 const height=()=>tileHost.clientHeight||Math.round(fallback.getBoundingClientRect().height);
 const width=()=>ready?tileHost.clientWidth:Math.round(fallback.getBoundingClientRect().width);
 function initialZoom(){
  const horizontal=Math.max(...xs)-Math.min(...xs);
  const vertical=Math.max(...ys)-Math.min(...ys);
  return xs.length===1?8:Math.max(0,Math.min(8,Math.floor(Math.log2(Math.min(
   (width()-72)/(size*Math.max(horizontal,1/1024)),(height()-72)/(size*Math.max(vertical,1/1024)))))));
 }
 function reveal(){
  if(ready||stopped)return;
  ready=true;
  clearTimeout(waitTimer);
  target.classList.add('loaded');
  fallback.hidden=true;
  status.textContent=tr('Яндекс Карты');
 }
 function close(){
  stopped=true;
  clearTimeout(drawTimer);clearTimeout(waitTimer);clearTimeout(queueTimer);
  observer.disconnect();
  target.removeEventListener('fd-map-select',select);
  tileHost.remove();
  target.classList.remove('loaded');
  fallback.hidden=false;
 }
 function draw(){
  if(stopped||!width()||!height())return;
  const w=width(), h=height(), count=2**z, world=count*size;
  const left=x*world-w/2, top=y*world-h/2;
  const across=Math.floor(left/size), down=Math.max(0,Math.floor(top/size));
  const visible=new Map();
  for(let col=across;col*size<left+w;col++){
   for(let row=down;row<count&&row*size<top+h;row++){
    const id=[z,col,row].join('/');
    visible.set(id,{col,row,distance:Math.hypot(col*size+size/2-x*world,row*size+size/2-y*world)});
   }
  }
  for(const [id,img] of tileImage){
   if(!visible.has(id)){
    img.remove();tileImage.delete(id);
   }
  }
  const position=(img,col,row)=>{
   img.style.left=Math.round(col*size-left)+'px';
   img.style.top=Math.round(row*size-top)+'px';
  };
  for(const [id,img] of tileImage){
   const item=visible.get(id);
   position(img,item.col,item.row);
  }
  clearTimeout(queueTimer);
  pending=[...visible].filter(([id])=>!tileImage.has(id)).sort((a,b)=>a[1].distance-b[1].distance);
  const loadNext=()=>{
   if(stopped||!pending.length)return;
   const [id,{col,row}]=pending.shift();
   const img=document.createElement('img');
   img.alt='';img.draggable=false;img.referrerPolicy='no-referrer';
   img.addEventListener('load',reveal,{once:true});
   img.src='https://tiles.api-maps.yandex.ru/v1/tiles/?'+new URLSearchParams({
    apikey:tilesKey,x:((col%count)+count)%count,y:row,z,lang:locale,l:'map',projection:'web_mercator'});
   tileImage.set(id,img);position(img,col,row);pictures.append(img);
   queueTimer=setTimeout(loadNext,42);
  };
  if(pending.length)queueTimer=setTimeout(loadNext,42);
  const toScreen=([px,py])=>[(px+Math.round(x-px))*world-left,py*world-top];
  lines.setAttribute('viewBox',`0 0 ${w} ${h}`);
  lines.innerHTML=paths.map(path=>{
   let previous;
   const d=path.map(point=>{
    const [sx,sy]=toScreen(point);
    const command=previous===undefined||Math.abs(sx-previous)>world/2?'M':'L';
    previous=sx;
    return command+sx.toFixed(1)+' '+sy.toFixed(1);
   }).join(' ');
   return `<path d="${d}"/>`;
  }).join('');
  for(const [code,button] of markers){
   const [sx,sy]=toScreen(locations[code]);
   button.style.left=sx+'px';button.style.top=sy+'px';
   button.hidden=sx<0||sx>w||sy<0||sy>h;
  }
 }
 for(const code of Object.keys(locations)){
  const marker=document.createElement('button');
  marker.className='tile-map-pin';
  marker.type='button';
  marker.dataset.tileAirport=code;
  marker.title=code+' · '+airportCity(code);
  marker.setAttribute('aria-label',marker.title);
  marker.classList.toggle('hub',code==='UUEE');
  marker.onclick=()=>onAirport(code);
  markers.set(code,marker);pins.append(marker);
 }
 function setZoom(next){
  z=Math.max(0,Math.min(17,next));
  for(const button of zoomControls.children)button.disabled=Number(button.dataset.delta)<0?z===0:z===17;
  draw();
 }
 for(const [label,symbol,delta] of [['Увеличить','+',1],['Уменьшить','−',-1]]){
  const button=document.createElement('button');
  button.type='button';button.textContent=symbol;button.dataset.delta=delta;
  button.setAttribute('aria-label',tr(label));
  button.onclick=()=>setZoom(z+delta);
  zoomControls.append(button);
 }
 tileHost.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button,a'))return;
  gesture={x:event.clientX,y:event.clientY};
  tileHost.setPointerCapture(event.pointerId);
 });
 tileHost.addEventListener('pointermove',event=>{
  if(!gesture)return;
  layer.style.transform=`translate(${event.clientX-gesture.x}px,${event.clientY-gesture.y}px)`;
 });
 function endDrag(event){
  if(!gesture)return;
  if(event.type==='pointerup'){
   const world=size*2**z;
   x-=(event.clientX-gesture.x)/world;
   y=Math.max(0,Math.min(1,y-(event.clientY-gesture.y)/world));
  }
  gesture=null;layer.style.transform='';draw();
 }
 tileHost.addEventListener('pointerup',endDrag);
 tileHost.addEventListener('pointercancel',endDrag);
 function select(event){
  const point=locations[event.detail];
  if(!point)return;
  x=point[0];y=point[1];draw();
 }
 target.addEventListener('fd-map-select',select);
 const observer=new ResizeObserver(()=>{
  clearTimeout(drawTimer);drawTimer=setTimeout(draw,80);
 });
 observer.observe(tileHost);
 status.textContent=tr('Подключение к Яндекс Картам…');
 waitTimer=setTimeout(()=>{
  if(ready)return;
  close();
  status.textContent=tr('Яндекс Карты недоступны · встроенная карта');
 },9000);
 setZoom(initialZoom());
 return close;
}
