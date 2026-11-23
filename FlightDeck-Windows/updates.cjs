module.exports = ({ app, ipcMain, appURL, autoUpdater }) => {
  let busy = false;
  let target;
  let available;
  const send = (channel, ...args) => {
    if (target && !target.isDestroyed()) target.send(channel, ...args);
  };
  const status = state => send('update-status', state);
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('update-available', info => { available = info; });
  autoUpdater.on('error', () => status('failed'));
  ipcMain.handle('update-application', async (event, action) => {
    if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== appURL) throw new Error('Invalid sender');
    if (action !== 'check' && action !== 'install') throw new Error('Invalid update action');
    target = event.sender;
    if (busy) return;
    if (!app.isPackaged) { status('development'); return; }
    busy = true;
    try {
      if (action === 'check') {
        available = undefined;
        status('checking');
        await autoUpdater.checkForUpdates();
        if (!available) { status('current'); return; }
        const { version, releaseNotes } = available;
        const fallback = Array.isArray(releaseNotes)
          ? releaseNotes.find(entry => entry.version === version)?.note
          : releaseNotes;
        let notes = fallback;
        if (/^\d+\.\d+\.\d+$/.test(version)) {
          try {
            const response = await fetch('https://api.github.com/repos/valerii-palch/FlightDeck/releases/tags/v' + version, {
              signal: AbortSignal.timeout(5000)
            });
            if (response.ok) notes = (await response.json()).body ?? fallback;
          } catch { /* The update remains available without GitHub's notes endpoint. */ }
        }
        send('update-available', version, String(notes ?? '').slice(0, 16000));
        return;
      }
      if (!available) { status('failed'); return; }
      status('downloading');
      await autoUpdater.downloadUpdate();
      status('installing');
      autoUpdater.quitAndInstall(true, true);
    } catch { status(action === 'install' ? 'installFailed' : 'failed'); }
    finally { busy = false; }
  });
};
