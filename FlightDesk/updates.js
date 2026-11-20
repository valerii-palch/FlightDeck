const updateMessages={
 checking:'Проверяем обновления…',
 downloading:'Загружаем обновление…',
 verifying:'Проверяем подпись обновления…',
 installing:'Устанавливаем обновление. Приложение перезапустится. На Mac подтверди системный запрос.',
 current:'У тебя последняя версия FlightDeck.',
 unpublished:'Обновления еще не опубликованы в GitHub Releases.',
 invalid:'Подпись или контрольная сумма обновления не прошла проверку. Установка отменена.',
 unsupported:'Для новой версии требуется более новая macOS.',
 installFailed:'Установка отменена или завершилась ошибкой. Можно попробовать снова.',
 failed:'Не удалось получить обновление. Проверь интернет и попробуй снова.',
 development:'Обновления доступны в установленной версии приложения.'
};
const updateBusyStates=['checking','downloading','verifying','installing'];
let updateState='idle', updateInfo, promptForUpdate=false;
const updateBridge=window.webkit?.messageHandlers?.updateApplication;
const updateRequest=action=>{
 if(updateBridge)updateBridge.postMessage(action);
 else if(window.flightDeckUpdates)window.flightDeckUpdates.request(action).catch(()=>window.flightDeckUpdateStatus('failed'));
 else window.flightDeckUpdateStatus('development');
};
function paintUpdateDialog(){
 const status=byId('updateStatus');
 if(!status)return;
 status.textContent=updateMessages[updateState]?tr(updateMessages[updateState]):'';
 const busy=updateBusyStates.includes(updateState);
 byId('releaseVersion').textContent=updateInfo?'FlightDeck v'+updateInfo.version:'';
 byId('releaseDetails').hidden=!updateInfo;
 byId('releaseNotes').textContent=updateInfo?.notes.trim().replace(/^[ \t]*[-*] /gm,'• ').replace(/^#{1,6} /gm,'')||tr('Описание выпуска недоступно.');
 byId('installUpdate').hidden=busy||!updateInfo;
 byId('retryUpdate').hidden=busy||!!updateInfo;
 byId('closeUpdate').disabled=updateState==='installing';
}
window.flightDeckUpdateStatus=state=>{
 if(!Object.hasOwn(updateMessages,state))return;
 updateState=state;
 paintUpdateDialog();
};
window.flightDeckUpdateAvailable=(version,notes)=>{
 if(typeof version!=='string'||typeof notes!=='string')return;
 updateInfo={version,notes};
 updateState='available';
 paintUpdateDialog();
 maybeOfferUpdate();
};
window.flightDeckUpdates?.onStatus(window.flightDeckUpdateStatus);
window.flightDeckUpdates?.onAvailable(window.flightDeckUpdateAvailable);
function checkApplicationUpdate(atLaunch=false){
 if(updateBusyStates.includes(updateState))return;
 promptForUpdate=atLaunch;
 updateInfo=undefined;
 window.flightDeckUpdateStatus('checking');
 updateRequest('check');
}
function maybeOfferUpdate(){
 if(!promptForUpdate||!updateInfo||byId('dialog').open||tourRoot)return;
 promptForUpdate=false;
 openApplicationUpdate();
}
function openApplicationUpdate(){
 openDialog('<h2 id="updateTitle">'+tr('Обновление FlightDeck')+'</h2>'+
 '<section id="releaseDetails" class="release-details" hidden><strong id="releaseVersion"></strong><h3>'+tr('Что нового')+'</h3><p id="releaseNotes"></p></section>'+
 '<p id="updateStatus" role="status" aria-live="polite"></p><div class="update-actions"><button type="button" id="installUpdate" class="primary">'+tr('Обновить')+'</button>'+
 '<button type="button" id="retryUpdate">'+tr('Проверить снова')+'</button><button type="button" id="closeUpdate" data-action="close">'+tr('Закрыть')+'</button></div>','update');
 byId('installUpdate').onclick=()=>{
  if(!updateInfo||updateBusyStates.includes(updateState))return;
  save();
  window.flightDeckUpdateStatus('downloading');
  updateRequest('install');
 };
 byId('retryUpdate').onclick=()=>checkApplicationUpdate();
 if(updateState==='idle')checkApplicationUpdate();
 else paintUpdateDialog();
}
document.addEventListener('click',event=>{if(event.target.closest('[data-action="update"]'))openApplicationUpdate();});
byId('dialog').addEventListener('close',maybeOfferUpdate);
byId('dialog').addEventListener('cancel',event=>{
 if(event.currentTarget.dataset.layout==='update'&&updateState==='installing')event.preventDefault();
});
