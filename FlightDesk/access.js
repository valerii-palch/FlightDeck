let demoWorkspace=null;

function signInFields(disabled) {
 return `<form id="cloudLoginForm" class="cloud-login"><label>${tr('Электронная почта')}<input name="email" type="email" autocomplete="username" required></label>
 <label>${tr('Пароль')}<input name="password" type="password" autocomplete="current-password" required></label>
 <button class="primary"${disabled}>${tr('Войти')}</button></form>
 <button id="googleLogin" type="button"${disabled}>${tr('Продолжить с Google')}</button>`;
}

function renderAccessGate() {
 byId('accessGate').innerHTML=`<div class="access-card panel">
  <div class="access-brand"><img src="__LOGO__" alt=""><strong>FlightDeck</strong></div>
  <h1>${tr('Вход в FlightDeck')}</h1><p class="muted">${tr('Войди, чтобы открыть личный журнал.')}</p>
  ${signInFields(cloudBusy?' disabled':'')}
  <p id="cloudStatus" role="status">${esc(cloudMessage(cloudStatus))}</p>
  <button id="openDemo" type="button"${cloudBusy?' disabled':''}>${tr('Продолжить без входа · Демо')}</button>
 </div>`;
 byId('openDemo').onclick=enterDemoWorkspace;
 bindCloudProfile();
}

function unlockWorkspace() {
 const firstEntry=!data.workspaceUnlocked;
 data.workspaceUnlocked=true;
 cloudBase=null;cloudRemoteBase=null;cloudConflict=null;cloudState='pending';
 save(false);
 queueCloudSync(0);
 if(firstEntry&&!tourCompleted()) setTimeout(()=>{
  if(data.workspaceUnlocked&&!demoWorkspace&&!byId('dialog').open)startTour();
 },250);
 return 'Вход выполнен. Проверяем облачную копию.';
}

function demoJournal() {
 const demoAirports=[
  ['ZZNA','ZNA','Норд-Бей','North Bay','NO',60.1,11.2],
  ['ZZSC','ZSC','Солнечный Берег','Sun Coast','ES',39.7,-1.1],
  ['ZZMR','ZMR','Медный Хребет','Copper Ridge','ES',41.9,-3.7],
  ['ZZSP','ZSP','Серебряный Порт','Silver Port','CA',46.8,-72.1]
 ];
 const airports=demoAirports.map(([icao,iata,cityRu,cityEn,countryCode,lat,lon],i)=>({
  icao,iata,cityRu,cityEn,countryCode,lat,lon,name:cityRu,nameRu:cityRu,nameEn:cityEn,custom:true,
  scenery:i!==2,gsx:i===0,python:i===0,developer:'Blue Horizon Studio',version:'1.2',
  stands:{narrow:'A1, A2, A3',wide:'B1, B2, B3'}
 }));
 const makeFlight=(i,days,dep,arr,status,extra={})=>({
  id:'example-'+i, number:'FD '+(100+i), tail:fleet[i%fleet.length].tail,
  date:new Date(Date.now()+days*86400000).toISOString().slice(0,10),
  dep,arr,status,type:flightTypes[0],std:'11:00',sta:'14:00',demo:true,...extra
 });
 const now=Date.now(),stamp=offset=>new Date(now+offset*60000).toISOString();
 const flights=[
  makeFlight(1,-1,'ZZNA','ZZSC','Выполнен',{atd:'11:13',ata:'14:32',depStand:'B2'}),
  makeFlight(2,-4,'ZZSC','ZZMR','Выполнен',{atd:'11:01',ata:'13:50'}),
  makeFlight(3,-8,'ZZSP','ZZNA','Выполнен',{sta:'18:40',atd:'11:09',ata:'18:30'}),
  makeFlight(0,0,'ZZNA','ZZSC','Идет посадка',{
   std:stamp(15).slice(11,16),sta:stamp(195).slice(11,16),
   stages:{fuel:stamp(-40),bags:stamp(-29),board:stamp(-10)}
  }),
  makeFlight(4,1,'ZZNA','ZZSP','Запланирован',{sta:'18:30'}),
  makeFlight(5,-2,'ZZSP','ZZSC','Отменен'),
  makeFlight(6,-6,'ZZNA','ZZSC','Уход на запасной',{diversionAirport:'ZZMR',atd:'11:10',ata:'14:02'})
 ];
 return {airports,flights,preferences:{includeDemo:true}};
}

function enterDemoWorkspace() {
 if(cloudBusy||demoWorkspace) return;
 demoWorkspace={data,page,tail,selected,airportCode};
 fleet=personalFleet.map((aircraft,i)=>({...aircraft,tail:['DEMO-A1','DEMO-A2','DEMO-B1'][i],
  name:['Northstar','Daybreak','Blue Horizon'][i]}));
 data=demoJournal();
 page='home';airportCode=data.airports[0].icao;fleetSlide=0;pickTail(fleet[0].tail);
 render();
}

function exitDemoWorkspace() {
 if(!demoWorkspace) return;
 ({data,page,tail,selected,airportCode}=demoWorkspace);
 demoWorkspace=null;fleet=personalFleet;fleetSlide=0;
 if(byId('dialog').open)byId('dialog').close();
 render();
}

function confirmProfileReset() {
 const signedIn=!!cloudSession;
 openDialog(`<h2>${tr('Сбросить рейсы и профиль?')}</h2>
  <p>${tr(signedIn?'Все рейсы и имя профиля будут удалены с этого устройства и из облака. Аэропорты сохранятся.':'Войди в аккаунт перед сбросом. Это позволит очистить и облачную копию.')}</p>
  <p id="resetStatus" role="status"></p>
  <div class="controls"><button data-action="close" autofocus>${tr('Отмена')}</button><button id="confirmProfileReset" class="${signedIn?'danger':'primary'}">${tr(signedIn?'Удалить все рейсы':'Войти')}</button></div>`);
 byId('confirmProfileReset').onclick=async()=>{
  if(!signedIn){byId('dialog').close();page='pilot';render();byId('cloudLoginForm')?.elements.email.focus();return;}
  const dialog=byId('dialog'), buttons=[...dialog.querySelectorAll('button')];
  if(cloudBusy){byId('resetStatus').textContent=tr('Дождись завершения синхронизации.');return;}
  buttons.forEach(b=>b.disabled=true);
  const preventClose=event=>event.preventDefault();
  dialog.addEventListener('cancel',preventClose);
  try {
   await resetCloudProfile();
   data.flights=[];data.preferences={...preferences(),profileName:''};
   pickTail(tail);save(false);dialog.close();render();
   notice(tr('Рейсы и профиль очищены.'));
  } catch(error) {
   byId('resetStatus').textContent=cloudMessage(error.message);
  } finally {
   dialog.removeEventListener('cancel',preventClose);
   buttons.forEach(b=>b.disabled=false);
  }
 };
}
