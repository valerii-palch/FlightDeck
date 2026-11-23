const feedbackEmail='valvah2000@gmail.com';
const tourStorageKey='flightdeck.onboarding.v1';
let tourRoot=null,tourIndex=0,tourReturnPage='home',tourFrame;
const tourSteps=[
 {page:'home',target:'.sidebar-new',title:'Добавь рейс',body:'Укажи маршрут, дату и время вылета.'},
 {page:'home',target:'.dashboard-latest',title:'Следи за рейсом',body:'Открой карточку рейса, чтобы отметить этапы полёта.'},
 {page:'journal',target:'.board-filters',title:'Открой журнал',body:'Найди рейс по номеру, дате или борту.'},
 {page:'pilot',target:'.cloud-profile',title:'Проверь синхронизацию',body:'В профиле виден статус синхронизации журнала.'},
 {page:'home',target:'[data-action="settings"]',title:'Открой настройки',body:'Здесь можно обновить приложение или повторить обучение.'}
];
function tourCompleted(){
 if(typeof window.flightDeckTourCompleted==='boolean')return window.flightDeckTourCompleted;
 try{return localStorage.getItem(tourStorageKey)==='done';}catch{return false;}
}
function finishTour(){
 if(!tourRoot)return;
 window.flightDeckTourCompleted=true;
 const native=window.webkit?.messageHandlers?.completeOnboarding;
 if(native)native.postMessage('done');
 else try{localStorage.setItem(tourStorageKey,'done');}catch{}
 tourRoot.remove();tourRoot=null;cancelAnimationFrame(tourFrame);
 document.querySelector('.shell').inert=false;
 window.removeEventListener('resize',positionTour);
 document.removeEventListener('scroll',positionTour,true);
 document.removeEventListener('keydown',tourKeydown,true);
 page=tourReturnPage;render();
 document.querySelector('[data-action="settings"]')?.focus();
 maybeOfferUpdate();
}
function tourKeydown(event){
 if(event.key==='Escape'){event.preventDefault();finishTour();return;}
 if(event.key!=='Tab')return;
 const buttons=[...tourRoot.querySelectorAll('button')].filter(b=>!b.disabled);
 const first=buttons[0],last=buttons.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
function positionTour(immediate=false){
 if(!tourRoot)return;
 cancelAnimationFrame(tourFrame);
 const paint=()=>{
  if(!tourRoot)return;
  const target=document.querySelector(tourSteps[tourIndex].target)||byId('main');
  const bounds=target.getBoundingClientRect();
  const left=Math.max(0,bounds.left),top=Math.max(0,bounds.top);
  const right=Math.min(innerWidth,bounds.right),bottom=Math.min(innerHeight,bounds.bottom);
  const radius=Math.max(0,Math.min((right-left)/2,(bottom-top)/2,parseFloat(getComputedStyle(target).borderTopLeftRadius)||0));
  const hole=`M ${left+radius} ${top} H ${right-radius} A ${radius} ${radius} 0 0 1 ${right} ${top+radius}
   V ${bottom-radius} A ${radius} ${radius} 0 0 1 ${right-radius} ${bottom}
   H ${left+radius} A ${radius} ${radius} 0 0 1 ${left} ${bottom-radius}
   V ${top+radius} A ${radius} ${radius} 0 0 1 ${left+radius} ${top} Z`.replace(/\s+/g,' ');
  tourRoot.querySelector('.tour-shade').style.clipPath=`path(evenodd, "M 0 0 H ${innerWidth} V ${innerHeight} H 0 Z ${hole}")`;
  const highlight=tourRoot.querySelector('.tour-highlight');
  Object.assign(highlight.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px',borderRadius:radius+'px'});
  const card=tourRoot.querySelector('.tour-card');
  const width=card.offsetWidth,height=card.offsetHeight;
  const x=Math.min(innerWidth-width-12,Math.max(12,left));
  let y=bottom+16;
  if(y+height>innerHeight-12)y=top-height-16;
  if(y<12){y=Math.max(12,innerHeight-height-16);}
  Object.assign(card.style,{left:x+'px',top:y+'px'});
 };
 if(immediate===true)paint();
 else tourFrame=requestAnimationFrame(paint);
}
function showTourStep(){
 const step=tourSteps[tourIndex];page=step.page;render();
 const target=document.querySelector(step.target)||byId('main');
 target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
 tourRoot.querySelector('h2').textContent=tr(step.title);
 tourRoot.querySelector('.tour-description').textContent=tr(step.body);
 tourRoot.querySelector('.tour-count').textContent=(tourIndex+1)+' / '+tourSteps.length;
 tourRoot.querySelector('[data-tour="back"]').disabled=tourIndex===0;
 tourRoot.querySelector('[data-tour="next"]').textContent=tr(tourIndex===tourSteps.length-1?'Готово':'Далее');
 positionTour(true);tourRoot.querySelector('[data-tour="next"]').focus();
}
function startTour(){
 if(tourRoot)return;
 byId('dialog').close();tourReturnPage=page;tourIndex=0;
 tourRoot=document.createElement('div');tourRoot.className='tour-overlay';
 tourRoot.innerHTML='<div class="tour-shade" aria-hidden="true"></div><div class="tour-highlight" aria-hidden="true"></div><section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourDescription"><div class="row"><small class="tour-count"></small><button type="button" data-tour="skip">'+tr('Пропустить')+'</button></div><h2 id="tourTitle"></h2><p class="tour-description" id="tourDescription"></p><div class="controls"><button type="button" data-tour="back">'+tr('Назад')+'</button><button type="button" class="primary" data-tour="next"></button></div></section>';
 document.body.append(tourRoot);document.querySelector('.shell').inert=true;
 tourRoot.addEventListener('click',event=>{
  const action=event.target.closest('[data-tour]')?.dataset.tour;
  if(action==='skip'||action==='next'&&tourIndex===tourSteps.length-1){finishTour();return;}
  if(action==='back')tourIndex=Math.max(0,tourIndex-1);
  if(action==='next')tourIndex++;
  if(action)showTourStep();
 });
 window.addEventListener('resize',positionTour);
 document.addEventListener('scroll',positionTour,true);
 document.addEventListener('keydown',tourKeydown,true);
 showTourStep();
}
function openFeedback(){
 openDialog('<h2>'+tr('Обратная связь')+'</h2><form id="feedbackForm" class="stack"><label>'+tr('Тема')+'<input name="subject" required maxlength="120" value="FlightDeck"></label><label>'+tr('Сообщение')+'<textarea name="message" required maxlength="5000" rows="6"></textarea></label><p class="muted">'+tr('Откроется черновик письма. Отправь его из почты, чтобы сообщение дошло.')+'</p><p class="muted">'+tr('Получатель')+': '+feedbackEmail+'</p><div class="controls"><button class="primary">'+tr('Открыть письмо')+'</button><button type="button" data-action="close">'+tr('Отмена')+'</button></div><a id="gmailFeedback" href="https://mail.google.com/mail/u/0/#inbox" rel="noopener" hidden>'+tr('Написать через Gmail')+'</a></form>');
 const form=byId('feedbackForm');
 const prepareDraft=()=>{
  const subject=form.elements.subject.value.trim(),message=form.elements.message.value.trim();
  if(!message){form.elements.message.setCustomValidity(tr('Напиши сообщение.'));form.reportValidity();return null;}
  const body=message+'\n\nFlightDeck v__VERSION__ · '+appLanguage()+'\n'+navigator.platform;
  const params=new URLSearchParams({subject:'FlightDeck · '+subject,body});
  const gmail=byId('gmailFeedback');gmail.href='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(feedbackEmail)+'&su='+encodeURIComponent('FlightDeck · '+subject)+'&body='+encodeURIComponent(body);gmail.hidden=false;
  return 'mailto:'+feedbackEmail+'?'+params.toString().replaceAll('+','%20');
 };
 form.onsubmit=event=>{
  event.preventDefault();
  const address=prepareDraft();if(!address)return;
  const link=document.createElement('a');link.href=address;document.body.append(link);link.click();link.remove();
 };
 byId('gmailFeedback').onclick=event=>{if(!form.reportValidity()||!prepareDraft())event.preventDefault();};
 form.elements.message.oninput=()=>form.elements.message.setCustomValidity('');
}
document.addEventListener('click',event=>{
 const action=event.target.closest('[data-action]')?.dataset.action;
 if(action==='tour')startTour();
 if(action==='feedback')openFeedback();
});
