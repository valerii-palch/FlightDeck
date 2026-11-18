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
let updateState='idle';
window.flightDeckUpdateStatus=state=>{
 if(!Object.hasOwn(updateMessages,state))return;
 updateState=state;
 const text=byId('updateStatus');if(text)text.textContent=tr(updateMessages[state]);
 const busy=['checking','downloading','verifying','installing'].includes(state);
 const retry=byId('retryUpdate');if(retry){retry.hidden=busy;retry.disabled=busy;}
 const close=byId('closeUpdate');if(close)close.disabled=state==='installing';
};
window.flightDeckUpdates?.onStatus(window.flightDeckUpdateStatus);
function checkApplicationUpdate(){
 if(['checking','downloading','verifying','installing'].includes(updateState))return;
 save();
 window.flightDeckUpdateStatus('checking');
 if(window.webkit?.messageHandlers?.updateApplication)window.webkit.messageHandlers.updateApplication.postMessage('check');
 else if(window.flightDeckUpdates)window.flightDeckUpdates.start().catch(()=>window.flightDeckUpdateStatus('failed'));
 else window.flightDeckUpdateStatus('development');
}
function openApplicationUpdate(){
 openDialog('<h2>'+tr('Обновить приложение')+'</h2><p>'+tr('Новая версия загрузится и установится автоматически. Затем FlightDeck перезапустится. Журнал сохранится.')+'</p><p id="updateStatus" role="status" aria-live="polite"></p><div class="controls"><button type="button" id="retryUpdate" class="primary">'+tr('Проверить снова')+'</button><button type="button" id="closeUpdate" data-action="close">'+tr('Закрыть')+'</button></div>');
 byId('retryUpdate').onclick=checkApplicationUpdate;
 if(['checking','downloading','verifying','installing'].includes(updateState))window.flightDeckUpdateStatus(updateState);
 else checkApplicationUpdate();
}
document.addEventListener('click',event=>{if(event.target.closest('[data-action="update"]'))openApplicationUpdate();});
