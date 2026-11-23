const { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, safeStorage, session, shell } = require('electron');
const { readFile, rename, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const appURL = 'flightdeck://app/index.html';
const htmlPath = join(__dirname, 'FlightDesk.html');
require('./google-auth.cjs')({ ipcMain, shell, appURL });
require('./updates.cjs')({ app, ipcMain, appURL, autoUpdater: require('electron-updater').autoUpdater });

ipcMain.handle('window-action', (event, action) => {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== appURL) throw new Error('Invalid sender');
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (action === 'close') window.close();
  if (action === 'minimize') window.minimize();
  if (action === 'maximize') {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  }
});

ipcMain.handle('session-store', async (event, operation, value) => {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== appURL) throw new Error('Invalid sender');
  const path = join(app.getPath('userData'), 'session.bin');
  if (operation === 'clear') return rm(path, { force: true });
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Session encryption is unavailable');
  if (operation === 'read') {
    try { return safeStorage.decryptString(await readFile(path)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  if (operation !== 'write' || typeof value !== 'string' || Buffer.byteLength(value) > 65536) throw new Error('Invalid session data');
  await writeFile(path + '.new', safeStorage.encryptString(value));
  await rename(path + '.new', path);
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'flightdeck',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

function openExternalLink(url, window) {
  const parsed = URL.parse(url);
  if (parsed?.protocol === 'https:' || parsed?.protocol === 'mailto:' && parsed.pathname.toLowerCase() === 'valvah2000@gmail.com') {
    shell.openExternal(url).catch(() => {
      if (!window.isDestroyed()) {
        window.webContents.executeJavaScript("notice(tr('Не удалось открыть ссылку в браузере.'))").catch(() => {});
      }
    });
  }
}

async function createWindow() {
  nativeTheme.themeSource = 'dark';
  const window = new BrowserWindow({
    title: 'FlightDeck',
    frame: false,
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 820,
    useContentSize: true,
    backgroundColor: '#090d16',
    icon: join(__dirname, 'icon.png'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url, window);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url === appURL) return;
    event.preventDefault();
    openExternalLink(url, window);
  });
  window.webContents.on('will-redirect', event => event.preventDefault());
  await window.loadURL(appURL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('app.flightdeck.windows');
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle('flightdeck', async request => {
      if (request.method !== 'GET' || request.url !== appURL) return new Response(null, { status: 404 });
      const html = await readFile(htmlPath, 'utf8');
      const languages = JSON.stringify(app.getPreferredSystemLanguages()).replace(/</g, '\\u003c');
      return new Response(html.replace('<head>', () =>
        '<head><script>window.flightDeckSystemLanguages = ' + languages + ';</script>'),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    });
    return createWindow();
  }).catch(() => {
    const russian = app.getPreferredSystemLanguages().find(locale => /^(ru|en)(-|$)/i.test(locale))?.toLowerCase().startsWith('ru');
    dialog.showErrorBox('FlightDeck', russian ? 'Не удалось загрузить интерфейс приложения.' : 'Could not load the application interface.');
    app.quit();
  });
}
