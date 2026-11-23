const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('flightDeckUpdates', {
 request: action => ipcRenderer.invoke('update-application', action),
 onAvailable: callback => ipcRenderer.on('update-available', (_event, version, notes) => callback(version, notes)),
 onStatus: callback => ipcRenderer.on('update-status', (_event, state) => callback(state)),
 onProgress: callback => ipcRenderer.on('update-progress', (_event, fraction) => callback(fraction))
});
contextBridge.exposeInMainWorld('flightDeckAuth', {
 googleSignIn: url => ipcRenderer.invoke('google-sign-in', url)
});
contextBridge.exposeInMainWorld('flightDeckSession', {
 request: (operation, value) => ipcRenderer.invoke('session-store', operation, value)
});
