const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('flightDeckUpdates', {
 start: () => ipcRenderer.invoke('update-application'),
 onStatus: callback => ipcRenderer.on('update-status', (_event, state) => callback(state))
});
contextBridge.exposeInMainWorld('flightDeckAuth', {
 googleSignIn: url => ipcRenderer.invoke('google-sign-in', url)
});
