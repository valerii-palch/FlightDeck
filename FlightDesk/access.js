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
   data.flights=[];data.preferences={...preferences(),profileName:''};storeProfilePhoto('');
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
