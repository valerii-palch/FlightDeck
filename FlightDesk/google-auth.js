async function startGoogleSignIn() {
 if(window.webkit?.messageHandlers?.googleSignIn){
  return new Promise((resolve,reject)=>{
   window.flightDeckGoogleResult=result=>{
    delete window.flightDeckGoogleResult;
    result.error?reject(Error(tr('Вход через Google отменен или недоступен.'))):resolve(result);
   };
   window.webkit.messageHandlers.googleSignIn.postMessage('');
  });
 }
 const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 const challenge=btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const url=new URL(cloudURL+'/auth/v1/authorize');
 url.search=new URLSearchParams({provider:'google',code_challenge:challenge,code_challenge_method:'s256'});
 if(window.flightDeckAuth){
  const callback=await window.flightDeckAuth.googleSignIn(url.href);
  const code=new URL(callback).searchParams.get('code');
  if(!code) throw Error(tr('Вход через Google отменен или недоступен.'));
  return {code,verifier};
 }
 if(location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')
  throw Error(tr('Для входа через Google открой установленное приложение.'));
 sessionStorage.setItem('flightdeck.oauth',JSON.stringify({verifier,created:Date.now()}));
 url.searchParams.set('redirect_to',location.origin+location.pathname);
 location.assign(url.href);
 return new Promise(()=>{});
}
async function completeGoogleSignIn(result){
 acceptCloudSession(await cloudRequest('/auth/v1/token?grant_type=pkce',{
  method:'POST',body:{auth_code:result.code,code_verifier:result.verifier}
 }));
 return unlockWorkspace();
}
async function resumeGoogleSignIn(){
 if(location.protocol!=='https:'&&location.protocol!=='http:') return;
 const callback=new URL(location.href),code=callback.searchParams.get('code');
 if(!code) return;
 try{
  const pending=JSON.parse(sessionStorage.getItem('flightdeck.oauth')||'null');
  sessionStorage.removeItem('flightdeck.oauth');
  if(!pending||Date.now()-pending.created>600000) return;
  callback.searchParams.delete('code');history.replaceState(null,'',callback);
  cloudStatus=await completeGoogleSignIn({code,verifier:pending.verifier});
 }catch(error){cloudStatus=error.message;cloudState='error';}
 page='pilot';render();
}
