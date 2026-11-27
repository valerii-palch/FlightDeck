let signedInThisLaunch=false;

function signInFields(disabled) {
 return `<form id="cloudLoginForm" class="cloud-login"><label>${tr('Электронная почта')}<input name="email" type="email" autocomplete="username" required></label>
 <label>${tr('Пароль')}<input name="password" type="password" autocomplete="current-password" required></label>
 <button class="primary"${disabled}>${tr('Войти')}</button></form>
 <button id="googleLogin" type="button"${disabled}>${tr('Продолжить с Google')}</button>`;
}

function renderAccessGate() {
 byId('accessGate').innerHTML=`<div class="access-card panel">
  <div class="access-brand"><img src="${brandImage}" alt=""><strong>FlightDeck</strong></div>
  <h1>${tr('Вход в FlightDeck')}</h1><p class="muted">${tr('Войди, чтобы открыть личный журнал.')}</p>
  ${signInFields(cloudBusy?' disabled':'')}
  <p id="cloudStatus" role="status">${esc(cloudMessage(cloudStatus))}</p>
 </div>`;
 bindCloudProfile();
}

function unlockWorkspace() {
 const firstEntry=!signedInThisLaunch;
 signedInThisLaunch=true;
 loadCloudCheckpoint();
 save(false);
 queueCloudSync(0);
 if(firstEntry&&!tourCompleted()) setTimeout(()=>{
  if(cloudSession&&!byId('dialog').open)startTour();
 },250);
 return 'Вход выполнен. Проверяем облачную копию.';
}

function confirmCollectionClear(kind) {
 const flights=kind==='flights';
 const title=flights?'Очистить журнал?':'Очистить аэропорты?';
 const warning=flights?
  'Все записи рейсов будут безвозвратно удалены с этого компьютера и из облака. После синхронизации они исчезнут на других устройствах. Профиль, аэропорты и настройки сохранятся.':
  'Все добавленные аэропорты и их статусы хабов будут безвозвратно удалены с этого компьютера и из облака. После синхронизации каталог очистится на других устройствах. Рейсы, профиль и настройки сохранятся. Названия аэропортов в старых рейсах останутся доступны.';
 openDialog('<h2>'+tr(title)+'</h2><p>'+tr(warning)+'</p><p>'+tr('Перед очисткой можно сохранить резервную копию. Отменить действие будет невозможно.')+'</p>'+
  '<label class="clear-confirm"><input type="checkbox" id="clearConsent">'+tr('Я понимаю последствия и подтверждаю удаление.')+'</label>'+
  '<p id="clearStatus" role="status" aria-live="polite"></p><div class="controls"><button data-action="close" autofocus>'+tr('Отмена')+'</button>'+
  '<button type="button" class="danger" id="confirmCollectionClear" disabled>'+tr(flights?'Удалить все рейсы':'Удалить все аэропорты')+'</button></div>');
 const button=byId('confirmCollectionClear'),consent=byId('clearConsent');
 consent.onchange=()=>button.disabled=!consent.checked;
 button.onclick=async()=>{
  if(!consent.checked)return;
  const dialog=byId('dialog'),controls=[...dialog.querySelectorAll('button,input')];
  if(!cloudSession||cloudBusy){byId('clearStatus').textContent=tr('Дождись завершения синхронизации.');return;}
  controls.forEach(control=>control.disabled=true);
  const preventClose=event=>event.preventDefault();
  dialog.addEventListener('cancel',preventClose);
  try{
   await clearCloudCollection(kind);
   if(flights)pickTail(tail);
   else {airportCode='';airportListPage=0;airportCountryFilter='';query='';}
   save(false);dialog.close();render();
   notice(tr(flights?'Журнал очищен.':'Аэропорты очищены.'));
  }catch(error){byId('clearStatus').textContent=cloudMessage(error.message);}
  finally{
   dialog.removeEventListener('cancel',preventClose);
   controls.forEach(control=>control.disabled=false);
   button.disabled=!consent.checked;
  }
 };
}
