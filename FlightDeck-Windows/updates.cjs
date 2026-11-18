module.exports = ({ app, ipcMain, appURL, autoUpdater }) => {
  let busy = false;
  let target;
  let available = false;
  const send = state => { if (target && !target.isDestroyed()) target.send('update-status', state); };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('update-available', () => { available = true; });
  autoUpdater.on('download-progress', () => send('downloading'));
  autoUpdater.on('error', () => send('failed'));
  ipcMain.handle('update-application', async event => {
    if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== appURL) throw new Error('Invalid sender');
    target = event.sender;
    if (busy) return;
    if (!app.isPackaged) { send('development'); return; }
    busy = true;
    available = false;
    send('checking');
    try {
      await autoUpdater.checkForUpdates();
      if (!available) { send('current'); return; }
      send('downloading');
      await autoUpdater.downloadUpdate();
      send('installing');
      autoUpdater.quitAndInstall(true, true);
    } catch { send('failed'); }
    finally { busy = false; }
  });
};
