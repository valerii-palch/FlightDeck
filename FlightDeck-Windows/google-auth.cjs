const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
let pending = false;

module.exports = function registerGoogleAuth({ ipcMain, shell, appURL }) {
 ipcMain.handle('google-sign-in', (event, rawURL) => {
  if (event.senderFrame?.url !== appURL || pending) throw Error('Sign-in unavailable');
  const url = new URL(rawURL);
  if (url.origin !== 'https://dntuchblnbpxgvdggapw.supabase.co' || url.pathname !== '/auth/v1/authorize' ||
      url.searchParams.get('provider') !== 'google' || url.searchParams.get('code_challenge_method') !== 's256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge') || '')) throw Error('Invalid sign-in URL');
  pending = true;
  return new Promise((resolve, reject) => {
   const path = '/auth/' + randomBytes(16).toString('hex');
   let timer, settled = false;
   const server = createServer((request, response) => {
    const callback = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET' || callback.pathname !== path) {
     response.writeHead(404).end(); return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('FlightDeck: return to the application.');
    finish(null, callback.href);
   });
   const finish = (error, callback) => {
    if (settled) return;
    settled = true; pending = false; clearTimeout(timer); server.close();
    event.sender.removeListener('destroyed', destroyed);
    error ? reject(error) : resolve(callback);
   };
   const destroyed = () => finish(Error('Sign-in canceled'));
   event.sender.once('destroyed', destroyed);
   server.once('error', error => finish(error));
   server.listen(0, '127.0.0.1', () => {
    url.searchParams.set('redirect_to', 'http://127.0.0.1:' + server.address().port + path);
    shell.openExternal(url.href).catch(error => finish(error));
   });
   timer = setTimeout(() => finish(Error('Sign-in timed out')), 180000);
  });
 });
};
