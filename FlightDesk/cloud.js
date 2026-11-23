const cloudURL='https://dntuchblnbpxgvdggapw.supabase.co';
const cloudKey='sb_publishable_2G0lwSIutKWV7bS6ry72mg_x_B5EsYt';
let cloudSession=null, cloudBase=null, cloudRemoteBase=null, cloudBusy=false, cloudStatus='', cloudConflict=null;
let cloudTimer, cloudState='pending', cloudRefresh;
const sessionBridge=window.webkit?.messageHandlers?.sessionStore;
const sessionStore=(operation,value)=>sessionBridge
 ?sessionBridge.postMessage({operation,...(value===undefined?{}:{value})})
 :window.flightDeckSession?.request(operation,value);
async function saveSession(operation,value){
 try {await sessionStore(operation,value);}
 catch {notice(tr('Не удалось сохранить сеанс на этом устройстве.'));}
}

function cloudIndicator(){
 if(navigator.onLine===false) return ['offline',tr("Не в сети")];
 if(!cloudSession) return ['signed-out',tr("Войти для синхронизации")];
 if(cloudConflict) return ['choice',tr(isWindowsDesktop?'Копии журнала различаются':'Выбрать копию')];
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
 const action=byId('sidebarSyncAction');
 if(action)action.hidden=state!=='choice';
}

function cloudEditing(){
 return byId('dialog')?.open||document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
}

function queueCloudSync(delay=350){
 if(!cloudSession) return;
 if(delay&&cloudState==='ready'){
  cloudState='pending';
  updateCloudIndicator();
 }
 clearTimeout(cloudTimer);
 cloudTimer=setTimeout(autoSyncCloud,delay);
}

async function autoSyncCloud(){
 if(!cloudSession||navigator.onLine===false)return;
 if(cloudBusy){queueCloudSync(1000);return;}
 cloudBusy=true;
 updateCloudIndicator();
 const profileButtonIds=['cloudSync','cloudLogout'];
 if(isWindowsDesktop)profileButtonIds.push('cloudUpload','cloudDownload');
 for(const id of profileButtonIds) byId(id)?.setAttribute('disabled','');
 const previousConflict=cloudConflict;
 let repaint=false;
 try {
  const result=await synchronizeCloud('',undefined,true);
  if(result.deferred){queueCloudSync(2000);return;}
  if(result.message){
   cloudConflict=null;
   cloudStatus=result.message;
   cloudState=cloudSame(cloudSnapshot(),cloudBase)?'ready':'pending';
   repaint=result.applied||(isWindowsDesktop&&previousConflict&&page==='pilot'&&!cloudEditing());
   if(cloudState==='pending') queueCloudSync();
  } else {
   cloudConflict=result;
   repaint=result.applied||page==='pilot'&&(!isWindowsDesktop||!cloudEditing()&&
    (!previousConflict||previousConflict.version!==result.version||!cloudSame(previousConflict.local,result.local)));
  }
 } catch(error){
  cloudStatus=error.message;
  cloudState='error';
 } finally {
  cloudBusy=false;
  if(page==='pilot') for(const id of profileButtonIds) byId(id)?.removeAttribute('disabled');
  if(repaint||!cloudSession) render();
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
  throw Object.assign(Error('Supabase отклонил запрос (HTTP '+response.status+').'),{status:response.status});
 }
 return result;
}

function selectAccountJournal(owner){
 if(journalOwner===owner)return;
 if(journalOwner){
  deviceJournals.set(journalOwner,data);
  data=deviceJournals.get(owner)??{airports:[],flights:[]};
  deviceJournals.delete(owner);
  airportCode=data.airports[0]?.icao||'';
  explicitAircraft=false;
  pickTail(tail);
 }
 journalOwner=owner;
 save(false);
}

async function acceptCloudSession(result){
 if(!result?.access_token||!result.refresh_token||!result.user?.id) throw Error('Сервер не вернул данные сеанса.');
 selectAccountJournal(result.user.id);
 cloudSession={access_token:result.access_token,refresh_token:result.refresh_token,
  user:{id:result.user.id,email:result.user.email},expiresAt:Date.now()+Number(result.expires_in||0)*1000};
 await saveSession('write',JSON.stringify(cloudSession));
}
async function restoreCloudSession(){
 if(cloudSession||cloudBusy)return;
 cloudBusy=true;
 try {
  const stored=JSON.parse(await sessionStore('read')||'null');
  if(!stored?.access_token||!stored.refresh_token||!stored.user?.id||!Number.isFinite(stored.expiresAt))return;
  selectAccountJournal(stored.user.id);
  cloudSession=stored;
  loadCloudCheckpoint();
  if(navigator.onLine!==false)await cloudToken(true);
 } catch(error) {
  if(cloudSession)cloudState='error';
  cloudStatus=error.message;
 } finally {
  cloudBusy=false;
  render();
  queueCloudSync(0);
 }
}
async function cloudToken(forceRefresh=false){
 if(!forceRefresh&&cloudSession.expiresAt>Date.now()+60000) return cloudSession.access_token;
 if(!cloudRefresh)cloudRefresh=(async()=>{
  try {
   await acceptCloudSession(await cloudRequest('/auth/v1/token?grant_type=refresh_token',{
    method:'POST',body:{refresh_token:cloudSession.refresh_token}
   }));
   return cloudSession.access_token;
  } catch(error) {
   if([400,401,403].includes(error.status)){
    await saveSession('clear');
    cloudSession=null;
    render();
   }
   throw error;
  } finally {cloudRefresh=null;}
 })();
 return cloudRefresh;
}
function loadCloudCheckpoint(){
 const checkpoint=data.cloudCheckpoint;
 cloudBase=checkpoint?.owner===cloudSession.user.id?checkpoint.local:null;
 cloudRemoteBase=cloudBase?(checkpoint.remote||cloudBase):null;
 cloudConflict=null;
 cloudState='pending';
}
function rememberCloudCheckpoint(){
 const checkpoint={owner:cloudSession.user.id,local:cloudBase,remote:cloudSame(cloudBase,cloudRemoteBase)?null:cloudRemoteBase};
 if(cloudSame(checkpoint,data.cloudCheckpoint))return;
 data.cloudCheckpoint=checkpoint;
 save(false);
}

const cloudSnapshot=()=>{
 const photo=preferences().profilePhotos?.[profilePhotoOwner()];
 return JSON.parse(JSON.stringify({flights:data.flights,airports:data.airports,profileName:preferences().profileName,profilePhoto:validProfilePhoto(photo)?photo:''}));
};
function cloudCanonical(value){
 if(Array.isArray(value)) return value.map(cloudCanonical);
 if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,cloudCanonical(value[key])]));
 return value;
}
const cloudSame=(a,b)=>JSON.stringify(cloudCanonical(a))===JSON.stringify(cloudCanonical(b));

function applyCloudCopy(copy){
 if(!validBackup(copy)) throw Error('Формат облачного журнала не поддерживается.');
 data={...data,...JSON.parse(JSON.stringify({flights:copy.flights,airports:copy.airports}))};
 if(typeof copy.profileName==='string') data.preferences={...preferences(),profileName:copy.profileName.trim().slice(0,80)};
 storeProfilePhoto(validProfilePhoto(copy.profilePhoto)?copy.profilePhoto:'');
 if(!airport(airportCode)) airportCode=data.airports[0]?.icao||'';
 if(!flight()) pickTail(tail);
 save(false);
}

async function synchronizeCloud(choice='',expected,automatic=false){
 const token=await cloudToken();
 const endpoint='/rest/v1/flightdeck_journals';
 const filter='?owner_id=eq.'+encodeURIComponent(cloudSession.user.id);
 const rows=await cloudRequest(endpoint+filter+'&select=version,journal',{token});
 const remote=rows[0];
 const local=cloudSnapshot();
 if(remote&&!validBackup(remote.journal)) throw Error('Формат облачного журнала не поддерживается.');
 if(choice&&(!cloudSame(expected.local,local)||expected.version!==(remote?.version??null))){
  throw Error('Журнал изменился. Нажми «Синхронизировать» и проверь копии снова.');
 }
 if(!remote&&cloudBase&&choice!=='upload')return {version:null,local,remote:null};
 const remoteJournal=remote?{...remote.journal,
  profileName:typeof remote.journal.profileName==='string'?remote.journal.profileName:local.profileName,
  profilePhoto:typeof remote.journal.profilePhoto==='string'?(validProfilePhoto(remote.journal.profilePhoto)?remote.journal.profilePhoto:''):local.profilePhoto}:null;
 // The logbook remains one unit. Each profile field can sync independently of a logbook conflict.
 const split=copy=>copy&&[{flights:copy.flights,airports:copy.airports},copy.profileName??'',copy.profilePhoto??''];
 const join=([journal,profileName,profilePhoto])=>({...journal,profileName,profilePhoto});
 const empty=[{flights:[],airports:[]},'',''];
 const here=split(local), there=split(remoteJournal), prior=split(cloudBase), previousRemote=split(cloudRemoteBase);
 const merged=here.map((value,index)=>{
  if(choice==='upload'||!there||cloudSame(value,there[index]))return value;
  if(choice==='download')return there[index];
  const localUnchanged=cloudSame(value,prior?.[index]??empty[index]);
  const remoteUnchanged=cloudSame(there[index],previousRemote?.[index]??empty[index]);
  if(localUnchanged===remoteUnchanged)return undefined;
  return localUnchanged?there[index]:value;
 });
 const conflicted=merged.some(value=>value===undefined);
 const localTarget=merged.map((value,index)=>value??here[index]);
 const remoteTarget=join(merged.map((value,index)=>value??there[index]));
 if(automatic&&!cloudSame(localTarget,here)&&cloudEditing())return {deferred:true};
 const write=!remote||!cloudSame(remoteTarget,{...join(there),profileName:remote.journal.profileName,profilePhoto:remote.journal.profilePhoto});
 let version=remote?.version??0;
 if(write){
  const body={journal:remoteTarget,version:version+1};
  const updated=await cloudRequest(remote?endpoint+filter+'&version=eq.'+remote.version:endpoint,{
   token,method:remote?'PATCH':'POST',representation:true,
   body:remote?body:{...body,owner_id:cloudSession.user.id}
  });
  if(!updated?.length) throw Error('Облачный журнал изменился. Нажми «Синхронизировать» еще раз.');
  version=body.version;
 }
 const current=split(cloudSnapshot());
 const safeCopy=join(localTarget.map((value,index)=>cloudSame(current[index],here[index])?value:current[index]));
 const applied=!cloudSame(join(current),safeCopy);
 if(applied)applyCloudCopy(safeCopy);
 cloudBase=join(merged.map((value,index)=>value??prior?.[index]??empty[index]));
 cloudRemoteBase=join(merged.map((value,index)=>value??previousRemote?.[index]??empty[index]));
 rememberCloudCheckpoint();
 if(conflicted)return {version,local:cloudSnapshot(),remote:remoteTarget,applied};
 return {message:write?'Локальный журнал сохранен в облаке.':applied?'Облачный журнал загружен.':'Журналы совпадают.',applied};
}

function cloudMessage(message) {
 const reauth = ' При необходимости войди заново.';
 if(message.endsWith(reauth)) return cloudMessage(message.slice(0,-reauth.length))+' '+tr(reauth.trim());
 const prefix = 'Supabase отклонил запрос (HTTP';
 if(message.startsWith(prefix)) return tr(prefix)+message.slice(prefix.length);
 return tr(message);
}

async function resetCloudProfile() {
 if(!cloudSession||cloudBusy) throw Error('Дождись завершения синхронизации.');
 clearTimeout(cloudTimer);
 cloudBusy=true;
 try {
  const token=await cloudToken();
  const owner=cloudSession.user.id;
  const endpoint='/rest/v1/flightdeck_journals';
  const filter='?owner_id=eq.'+encodeURIComponent(owner);
  const [remote]=await cloudRequest(endpoint+filter+'&select=version,journal',{token});
  if(remote&&!validBackup(remote.journal)) throw Error('Формат облачного журнала не поддерживается.');
  const local={...cloudSnapshot(),flights:[],profileName:'',profilePhoto:''};
  const journal={...local,airports:remote?.journal.airports??local.airports};
  const body={journal,version:(remote?.version??0)+1};
  const updated=await cloudRequest(remote?endpoint+filter+'&version=eq.'+remote.version:endpoint,{
   token,method:remote?'PATCH':'POST',representation:true,
   body:remote?body:{...body,owner_id:owner}
  });
  if(!updated?.length) throw Error('Журнал изменился. Подтверди сброс снова.');
  cloudBase=local;cloudRemoteBase=journal;
  rememberCloudCheckpoint();
  cloudConflict=cloudSame(local,journal)?null:{version:body.version,local,remote:journal};
  cloudState='ready';
  cloudStatus='Рейсы и профиль очищены.';
 } finally {cloudBusy=false;}
}

function windowsCloudConflict({local,remote},disabled){
 const compare=(title,copy)=>`<div class="strip row"><strong>${tr(title)}</strong><span>${tr('Рейсы')}: ${copy.flights.length} · ${tr('Аэропорты')}: ${copy.airports.length}</span></div>`;
 return `<div class="cloud-conflict stack facts">
 <h3>${tr('Копии журнала различаются')}</h3>
 ${remote?`<p>${tr('Выбери, какую копию сохранить. Она заменит данные во второй копии. Файл JSON для синхронизации не нужен.')}</p>
 ${compare('На этом компьютере',local)}${compare('В облаке',remote)}
 <div class="controls"><button id="cloudDownload"${disabled}>${tr('Заменить данные на компьютере')}</button><button id="cloudUpload"${disabled}>${tr('Заменить данные в облаке')}</button></div>`:
 `<p>${tr('В облаке нет копии журнала. Можно загрузить данные с этого компьютера.')}</p><button id="cloudUpload"${disabled}>${tr('Загрузить в облако')}</button>`}
 <div class="controls"><button type="button" data-action="export-backup">${tr('Сохранить локальную копию в JSON')}</button></div></div>`;
}

function cloudProfilePanel(){
 const disabled=cloudBusy?' disabled':'';
 const conflict=cloudConflict;
 return `<section class="panel facts cloud-profile" aria-labelledby="cloudHeading"><h2 id="cloudHeading"${isWindowsDesktop?' tabindex="-1"':''}>${tr("Аккаунт и синхронизация")}</h2>`+
 `<p>${tr("Вход выполнен как")} <strong>`+esc(cloudSession.user.email)+'</strong></p>'+
 '<div class="controls facts"><button id="cloudSync" class="primary"'+disabled+`>${tr("Синхронизировать")}</button></div>`+
 (conflict?(isWindowsDesktop?windowsCloudConflict(conflict,disabled):'<div class="cloud-conflict facts">'+(conflict.remote?
 `<p>${tr("Копии различаются. Локально:")} `+conflict.local.flights.length+' '+tr('рейсов ·')+' '+esc(conflict.local.profileName)+'. '+tr('В облаке:')+' '+conflict.remote.flights.length+' '+tr('рейсов')+(conflict.remote.profileName?' · '+esc(conflict.remote.profileName):'')+'.</p>'+
 '<div class="controls facts"><button id="cloudDownload"'+disabled+`>${tr("Использовать облачную копию")}</button><button id="cloudUpload"`+disabled+`>${tr("Использовать локальную копию")}</button><button data-action="backup">${tr("Резервная копия")}</button></div>`:
 `<p>${tr("Облачной копии пока нет.")}</p><button id="cloudUpload" class="facts"`+disabled+`>${tr("Загрузить в облако")}</button>`)+'</div>'):'')+
 `<p class="muted facts">${tr("Синхронизируются имя, фотография профиля, рейсы и аэропорты.")}</p>`+
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
  const buttons=[...status.parentElement.querySelectorAll('button'),byId('cloudLogout')].filter(Boolean);
  buttons.forEach(button=>button.disabled=true);
  try {cloudStatus=await action()||'';}
  catch(error){cloudStatus=error.message;cloudState='error';}
  finally {
   cloudBusy=false;
   if(!cloudSession||(page==='pilot'||!byId('accessGate').hidden||form)&&!byId('dialog')?.open) render();
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
    await acceptCloudSession(await cloudRequest('/auth/v1/token?grant_type=password',{
     method:'POST',body:{email,password}
    }));
    return unlockWorkspace();
   });
  };
  return;
 }
 if(!cloudSession) return;
 const sync=async(choice,expected)=>{
  if(!isWindowsDesktop)cloudConflict=null;
  const result=await synchronizeCloud(choice,expected);
  if(result.message){cloudConflict=null;cloudState='ready';return result.message;}
  cloudConflict=result;
 };
 const conflict=cloudConflict;
 byId('cloudSync').onclick=()=>perform(()=>sync());
 if(byId('cloudUpload')) byId('cloudUpload').onclick=()=>perform(()=>sync('upload',conflict));
 if(byId('cloudDownload')) byId('cloudDownload').onclick=()=>perform(()=>sync('download',conflict));
 byId('cloudLogout').onclick=()=>perform(async()=>{
  try {await cloudRequest('/auth/v1/logout?scope=local',{method:'POST',token:await cloudToken()});}
  finally {
   await saveSession('clear');
   clearTimeout(cloudTimer);cloudSession=null;cloudBase=null;cloudRemoteBase=null;cloudConflict=null;
   explicitAircraft=false;page='home';
   if(byId('dialog').open)byId('dialog').close();
  }
  return 'Выход выполнен.';
 });
}
