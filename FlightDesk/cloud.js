const cloudURL='https://dntuchblnbpxgvdggapw.supabase.co';
const cloudKey='sb_publishable_2G0lwSIutKWV7bS6ry72mg_x_B5EsYt';
let cloudSession=null, cloudBase=null, cloudRemoteBase=null, cloudBusy=false, cloudStatus='', cloudConflict=null;
let cloudTimer, cloudState='pending';

function cloudIndicator(){
 if(!cloudSession) return ['signed-out',tr("Войти для синхронизации")];
 if(navigator.onLine===false) return ['offline',tr("Нет сети")];
 if(cloudConflict) return ['choice',tr("Выбрать копию")];
 if(cloudBusy) return ['busy',tr("Синхронизация…")];
 if(cloudState==='error') return ['error',tr("Ошибка синхронизации")];
 if(cloudState==='ready') return ['ready',tr("Синхронизировано")];
 return ['pending',tr("Ожидает синхронизации")];
}

function updateCloudIndicator(){
 const indicator=byId('sidebarSync');
 if(!indicator) return;
 const [state,label]=cloudIndicator();
 indicator.dataset.state=state;
 const status=indicator.lastElementChild;
 if(status.textContent!==label) status.textContent=label;
}

function cloudEditing(){
 return byId('dialog')?.open||document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
}

function queueCloudSync(delay=900){
 if(!cloudSession||cloudConflict) return;
 if(delay&&cloudState==='ready'){
  cloudState='pending';
  updateCloudIndicator();
 }
 clearTimeout(cloudTimer);
 cloudTimer=setTimeout(autoSyncCloud,delay);
}

async function autoSyncCloud(){
 if(!cloudSession||cloudConflict||cloudBusy||navigator.onLine===false) return;
 if(cloudEditing()){queueCloudSync(2000);return;}
 cloudBusy=true;
 updateCloudIndicator();
 const profileButtons=['cloudSync','cloudLogout'].map(byId).filter(Boolean);
 profileButtons.forEach(button=>button.disabled=true);
 let repaint=false;
 try {
  const result=await synchronizeCloud('',undefined,true);
  if(result.deferred){queueCloudSync(2000);return;}
  if(result.message){
   cloudStatus=result.message;
   cloudState=cloudSame(cloudSnapshot(),cloudBase)?'ready':'pending';
   repaint=result.applied;
   if(cloudState==='pending') queueCloudSync();
  } else {
   cloudConflict=result;
   repaint=page==='pilot';
  }
 } catch(error){
  cloudStatus=error.message;
  cloudState='error';
 } finally {
  cloudBusy=false;
  if(page==='pilot') for(const id of ['cloudSync','cloudLogout']) byId(id)?.removeAttribute('disabled');
  if(repaint) render();
  else {
   updateCloudIndicator();
   const status=byId('cloudStatus');
   if(status) status.textContent=cloudMessage(cloudStatus);
  }
 }
}

async function cloudRequest(path,{method='GET',body,token,representation=false}={}){
 let response;
 try {
  response=await fetch(cloudURL+path,{
   method,
   signal:AbortSignal.timeout(15000),
   headers:{apikey:cloudKey,...(token?{Authorization:'Bearer '+token}:{}),
    ...(body?{'Content-Type':'application/json'}:{}),...(representation?{Prefer:'return=representation'}:{})},
   body:body?JSON.stringify(body):undefined
  });
 } catch {throw Error('Сервер недоступен. Локальный журнал сохранен.');}
 const result=await response.json().catch(()=>null);
 if(!response.ok){
  if(response.status===409) throw Error('Облачная копия уже создана на другом устройстве. Нажми «Синхронизировать».');
  if(result?.code==='PGRST205'||result?.code==='42P01') throw Error('Таблица еще не настроена. Выполни cloud.sql в Supabase.');
  if(response.status===429) throw Error('Слишком много запросов. Попробуй позже.');
  if(path==='/auth/v1/token?grant_type=password'){
   if(result?.error_code==='email_not_confirmed') throw Error('Email еще не подтвержден. Проверь пользователя в Supabase.');
   if(response.status===400||response.status===401) throw Error('Проверь email и пароль.');
  }
  throw Error('Supabase отклонил запрос (HTTP '+response.status+').');
 }
 return result;
}

function acceptCloudSession(result){
 if(!result?.access_token||!result.refresh_token||!result.user?.id) throw Error('Сервер не вернул данные сеанса.');
 cloudSession={...result,expiresAt:Date.now()+Number(result.expires_in||0)*1000};
}

async function cloudToken(){
 if(cloudSession.expiresAt>Date.now()+60000) return cloudSession.access_token;
 try {
  acceptCloudSession(await cloudRequest('/auth/v1/token?grant_type=refresh_token',{
   method:'POST',body:{refresh_token:cloudSession.refresh_token}
  }));
 } catch(error){throw Error(error.message+' При необходимости войди заново.');}
 return cloudSession.access_token;
}

const cloudSnapshot=()=>JSON.parse(JSON.stringify({flights:data.flights,airports:data.airports,profileName:preferences().profileName}));
function cloudCanonical(value){
 if(Array.isArray(value)) return value.map(cloudCanonical);
 if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,cloudCanonical(value[key])]));
 return value;
}
const cloudSame=(a,b)=>JSON.stringify(cloudCanonical(a))===JSON.stringify(cloudCanonical(b));

function applyCloudCopy(copy){
 if(!validBackup(copy)) throw Error('Формат облачного журнала не поддерживается.');
 data={...data,...JSON.parse(JSON.stringify({flights:copy.flights,airports:copy.airports}))};
 if(typeof copy.profileName==='string'&&copy.profileName.trim()) data.preferences={...preferences(),profileName:copy.profileName.trim().slice(0,80)};
 mergeCodes(data);
 if(!airport(airportCode)) airportCode=data.airports[0].icao;
 if(!flight()) pickTail(tail);
 save(false);
}

async function synchronizeCloud(choice='',expected,automatic=false){
 const token=await cloudToken();
 const endpoint='/rest/v1/flightdeck_journals';
 const filter='?owner_id=eq.'+encodeURIComponent(cloudSession.user.id);
 const rows=await cloudRequest(endpoint+filter+'&select=version,journal',{token});
 if(automatic&&cloudEditing()) return {deferred:true};
 const remote=rows[0];
 const local=cloudSnapshot();
 if(remote&&!validBackup(remote.journal)) throw Error('Формат облачного журнала не поддерживается.');
 if(choice&&(!cloudSame(expected.local,local)||expected.version!==(remote?.version??null))){
  throw Error('Журнал изменился. Нажми «Синхронизировать» и проверь копии снова.');
 }
 const remoteJournal=remote?{...remote.journal,profileName:remote.journal.profileName??local.profileName}:null;
 if(remote&&cloudSame(local,remoteJournal)&&typeof remote.journal.profileName==='string'){
  cloudBase=local;
  cloudRemoteBase=local;
  return {message:'Журналы совпадают.'};
 }
 if(remote&&cloudBase&&cloudSame(local,cloudBase)&&cloudSame(remoteJournal,cloudRemoteBase)&&!choice){
  return {message:'Журналы совпадают.'};
 }
 if(remote&&(choice==='download'||(!choice&&cloudBase&&cloudSame(local,cloudBase)))){
  applyCloudCopy(remoteJournal);
  cloudBase=cloudSnapshot();
  cloudRemoteBase=remoteJournal;
  return {message:'Облачный журнал загружен.',applied:true};
 }
 if(choice==='upload'||(remote&&cloudSame(local,remoteJournal))||(remote&&cloudBase&&cloudSame(remoteJournal,cloudRemoteBase))){
  const body={journal:local,version:(remote?.version||0)+1};
  const updated=await cloudRequest(remote?endpoint+filter+'&version=eq.'+remote.version:endpoint,{
   token,method:remote?'PATCH':'POST',representation:true,
   body:remote?body:{...body,owner_id:cloudSession.user.id}
  });
  if(!updated?.length) throw Error('Облачный журнал изменился. Нажми «Синхронизировать» еще раз.');
  cloudBase=local;
  cloudRemoteBase=local;
  return {message:'Локальный журнал сохранен в облаке.'};
 }
 return {version:remote?.version??null,local,remote:remote?.journal};
}

function cloudMessage(message) {
 const reauth = ' При необходимости войди заново.';
 if(message.endsWith(reauth)) return cloudMessage(message.slice(0,-reauth.length))+' '+tr(reauth.trim());
 const prefix = 'Supabase отклонил запрос (HTTP';
 if(message.startsWith(prefix)) return tr(prefix)+message.slice(prefix.length);
 return tr(message);
}

function cloudProfilePanel(){
 const disabled=cloudBusy?' disabled':'';
 const conflict=cloudConflict;
 return `<section class="panel facts cloud-profile" aria-labelledby="cloudHeading"><h2 id="cloudHeading">${tr("Аккаунт и синхронизация")}</h2>`+
 (cloudSession?
 `<p>${tr("Вход выполнен как")} <strong>`+esc(cloudSession.user.email)+'</strong></p>'+
 '<div class="controls facts"><button id="cloudSync" class="primary"'+disabled+`>${tr("Синхронизировать")}</button><button id="cloudLogout"`+disabled+`>${tr("Выйти")}</button></div>`+
 (conflict?'<div class="cloud-conflict facts">'+(conflict.remote?
 `<p>${tr("Копии различаются. Локально:")} `+conflict.local.flights.length+' '+tr('рейсов ·')+' '+esc(conflict.local.profileName)+'. '+tr('В облаке:')+' '+conflict.remote.flights.length+' '+tr('рейсов')+(conflict.remote.profileName?' · '+esc(conflict.remote.profileName):'')+'.</p>'+
 '<div class="controls facts"><button id="cloudDownload"'+disabled+`>${tr("Использовать облачную копию")}</button><button id="cloudUpload"`+disabled+`>${tr("Использовать локальную копию")}</button><button data-action="backup">${tr("Резервная копия")}</button></div>`:
 `<p>${tr("Облачной копии пока нет.")}</p><button id="cloudUpload" class="facts"`+disabled+`>${tr("Загрузить в облако")}</button>`)+'</div>':''):
 `<form id="cloudLoginForm" class="cloud-login"><label>${tr("Электронная почта")}<input name="email" type="email" autocomplete="username" required></label>`+
 `<label>${tr("Пароль")}<input name="password" type="password" autocomplete="current-password" required></label><button class="primary"`+disabled+`>${tr("Войти")}</button></form><button id="googleLogin" class="facts" type="button"`+disabled+`>${tr("Продолжить с Google")}</button>`)+
 `<p class="muted facts">${tr("Синхронизируются имя профиля, рейсы и аэропорты.")}</p>`+
 '<p id="cloudStatus" class="muted" role="status">'+esc(cloudBusy?tr("Подождите…"):cloudMessage(cloudStatus))+'</p></section>';
}

function bindCloudProfile(){
 const form=byId('cloudLoginForm');
 const perform=async action=>{
  if(cloudBusy) return;
  cloudBusy=true;
  updateCloudIndicator();
  const status=byId('cloudStatus');
  status.textContent=tr("Подождите…");
  const buttons=[...status.parentElement.querySelectorAll('button')];
  buttons.forEach(button=>button.disabled=true);
  try {cloudStatus=await action()||'';}
  catch(error){cloudStatus=error.message;cloudState='error';}
  finally {
   cloudBusy=false;
   if(page==='pilot'&&!byId('dialog')?.open) render();
   else updateCloudIndicator();
  }
 };
 if(form){
  byId('googleLogin').onclick=()=>perform(async()=>completeGoogleSignIn(await startGoogleSignIn()));
  form.onsubmit=e=>{
   e.preventDefault();
   const email=form.elements.email.value.trim(),password=form.elements.password.value;
   form.elements.password.value='';
   perform(async()=>{
    acceptCloudSession(await cloudRequest('/auth/v1/token?grant_type=password',{
     method:'POST',body:{email,password}
    }));
    cloudBase=null;cloudRemoteBase=null;cloudConflict=null;cloudState='pending';
    queueCloudSync(0);
    return 'Вход выполнен. Проверяем облачную копию.';
   });
  };
  return;
 }
 if(!cloudSession) return;
 const sync=async(choice,expected)=>{
  cloudConflict=null;
  const result=await synchronizeCloud(choice,expected);
  if(result.message){cloudState='ready';return result.message;}
  cloudConflict=result;
 };
 const conflict=cloudConflict;
 byId('cloudSync').onclick=()=>perform(()=>sync());
 if(byId('cloudUpload')) byId('cloudUpload').onclick=()=>perform(()=>sync('upload',conflict));
 if(byId('cloudDownload')) byId('cloudDownload').onclick=()=>perform(()=>sync('download',conflict));
 byId('cloudLogout').onclick=()=>perform(async()=>{
  try {await cloudRequest('/auth/v1/logout?scope=local',{method:'POST',token:await cloudToken()});}
  finally {clearTimeout(cloudTimer);cloudSession=null;cloudBase=null;cloudRemoteBase=null;cloudConflict=null;}
  return 'Выход выполнен.';
 });
}
