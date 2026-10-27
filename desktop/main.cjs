const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, session } = require('electron');
const { mkdirSync, realpathSync } = require('node:fs');
const { readFile, writeFile, rename, rm } = require('node:fs/promises');
const { join, isAbsolute } = require('node:path');
const { loadSettings, saveSettings, resolveLibraryChoice } = require('./settings.cjs');
const { isAppURL, isAllowedPermission } = require('./security.cjs');
const { createBackend } = require('./backend.cjs');
const { createLog } = require('./log.cjs');

const RELEASES = 'https://github.com/mi1wei/cardart/releases';

async function startDesktop({ appRoot = join(__dirname, '..'), licensePublicKeyFile = join(__dirname, 'license-public.pem') } = {}) {
  app.setName('Folio');
  if (process.platform === 'win32') app.setAppUserModelId('io.github.mi1wei.folio');
  const selectedProfile = app.commandLine.getSwitchValue('user-data-dir');
  if (selectedProfile && !isAbsolute(selectedProfile)) throw new Error('user-data-dir must be absolute');
  const profile = selectedProfile || join(app.getPath('appData'), 'Folio');
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath('userData', realpathSync(profile));
  if (!app.requestSingleInstanceLock()) { app.quit(); return null; }
  let backend;
  let window;
  let origin;
  let quitting = false;
  let stopJob;
  const stateFile = join(profile, 'runtime.json');
  const settingsFile = join(profile, 'desktop.json');
  const log = createLog(join(profile, 'logs/desktop.log'));
  let language;
  let settings;
  let metadata;

  function showWindow() {
    if (window?.isDestroyed()) return;
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  }
  function text(zh, en) { return language === 'zh' ? zh : en; }
  async function stop() {
    stopJob ??= (async () => {
      quitting = true;
      await backend?.stop();
      await rm(stateFile, { force: true });
      await log('Folio stopped');
    })();
    return stopJob;
  }
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    void stop().then(() => app.quit()).catch((error) => { dialog.showErrorBox('Folio', error.message); app.exit(1); });
  });
  await app.whenReady();
  language = /^zh/i.test(app.getLocale()) ? 'zh' : 'en';
  metadata = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
  app.setAboutPanelOptions({ applicationName: 'Folio', applicationVersion: metadata.version });
  app.setAppLogsPath(join(profile, 'logs'));

  async function chooseLibrary(defaultPath) {
    const result = await dialog.showOpenDialog({
      title: text('选择相册库文件夹', 'Choose the album library'),
      defaultPath, properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  }
  async function boot() {
    const { DEFAULT_DIR } = await import('../server/library.js');
    const choice = await resolveLibraryChoice({
      envDir: process.env.ALBUM_LIBRARY, storedDir: settings.libraryDir,
      picturesDir: app.getPath('pictures'), legacyDir: DEFAULT_DIR,
    });
    let dir = choice.path;
    if (!dir) {
      const selected = await dialog.showMessageBox({
        type: 'question', message: text('发现多个相册库，请选择', 'Choose an existing album library'),
        buttons: [...choice.conflicts, text('其他文件夹', 'Other folder')], cancelId: choice.conflicts.length,
      });
      dir = choice.conflicts[selected.response] || await chooseLibrary(app.getPath('pictures'));
    }
    if (!dir) return false;
    const previousPort = settings.preferredPort || 5180;
    backend = createBackend({
      fork: utilityProcess.fork, appRoot, profile,
      config: {
        libraryDir: dir,
        dist: app.isPackaged ? join(process.resourcesPath, 'web') : join(appRoot, 'dist'),
        preferredPort: previousPort, licensePublicKeyFile, licenseFile: join(profile, 'license.json'),
      },
      log,
      onExit(error) {
        void log(`${error.code || 'BACKEND_EXIT'} ${error.message}`);
        if (!quitting) {
          dialog.showErrorBox('Folio', text('相册服务已停止，请退出后重试。', 'The library service stopped. Quit and reopen Folio.'));
          void stop().then(() => app.quit());
        }
      },
    });
    try { origin = await backend.ready; }
    catch (error) { await backend.stop(); throw error; }
    settings = { version: 1, libraryDir: dir, preferredPort: Number(new URL(origin).port || 80) };
    await saveSettings(settingsFile, settings);
    await writeFile(`${stateFile}.tmp`, JSON.stringify({
      pid: process.pid, servicePid: backend.child.pid, version: metadata.version,
      arch: process.arch, origin,
    }), { mode: 0o600 });
    await rename(`${stateFile}.tmp`, stateFile);
    await log(`Folio ${metadata.version} ${process.platform}-${process.arch} started on port ${settings.preferredPort}`);
    if (settings.preferredPort !== previousPort) {
      void dialog.showMessageBox({
        type: 'info',
        message: text('原端口被占用，已换用新端口，请重新扫码或更新主屏幕链接。', 'The saved port was occupied. Rescan the QR code or replace saved phone links.'),
      });
    }
    return true;
  }

  try { settings = await loadSettings(settingsFile); }
  catch (error) {
    await log(`${error.code || 'SETTINGS_ERROR'} ${error.message}`);
    const dir = await chooseLibrary(app.getPath('pictures'));
    if (!dir) { await stop(); app.quit(); return null; }
    settings = { version: 1, libraryDir: dir };
  }
  while (!quitting) {
    try { if (await boot()) break; await stop(); app.quit(); return null; }
    catch (error) {
      await backend?.stop();
      await log(`${error.code || 'STARTUP_ERROR'} ${error.message}`);
      const response = await dialog.showMessageBox({
        type: 'error', message: text('无法打开相册库', 'Unable to open the library'),
        detail: `${error.code || ''}: ${error.message}`,
        buttons: [text('选择其他相册库', 'Choose another library'), text('退出', 'Quit')], cancelId: 1,
      });
      if (response.response === 1) { await stop(); app.quit(); return null; }
      const dir = await chooseLibrary(app.getPath('pictures'));
      if (!dir) { await stop(); app.quit(); return null; }
      settings = { ...settings, libraryDir: dir };
      delete process.env.ALBUM_LIBRARY;
    }
  }
  if (quitting) return null;
  session.defaultSession.setPermissionCheckHandler((contents, permission, target) => isAllowedPermission(permission, target, origin));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(isAllowedPermission(permission, details.requestingUrl || contents.getURL(), origin));
  });
  const langCookie = await session.defaultSession.cookies.get({ url: origin, name: 'folio_lang' });
  if (['zh', 'en'].includes(langCookie[0]?.value)) language = langCookie[0].value;
  window = new BrowserWindow({
    width: 1180, height: 800, minWidth: 720, minHeight: 480,
    title: 'Folio', backgroundColor: '#f7f9fb', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false },
  });
  window.webContents.on('will-navigate', (event, target) => { if (!isAppURL(target, origin)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('close', (event) => { if (!quitting) { event.preventDefault(); window.hide(); } });
  const openPath = (path) => { void shell.openPath(path).then((error) => { if (error) dialog.showErrorBox('Folio', error); }); };
  function setMenu() {
    const items = [
      { label: text('打开相册库', 'Open Library'), click: () => openPath(settings.libraryDir) },
      { label: text('选择相册库', 'Choose Library'), async click() {
        const dir = await chooseLibrary(settings.libraryDir);
        if (!dir || quitting) return;
        const previous = settings;
        await backend.stop();
        settings = { ...settings, libraryDir: dir };
        try { await boot(); await window.loadURL(`${origin}/`); }
        catch (error) { settings = previous; await boot(); dialog.showErrorBox('Folio', error.message); }
      } },
      { label: text('打开日志', 'Open Logs'), click: () => openPath(join(profile, 'logs')) },
      { label: text('下载新版', 'Download Updates'), click: () => { void shell.openExternal(RELEASES); } },
      { type: 'separator' },
      { role: 'about', label: text('关于 Folio', 'About Folio') },
      { role: 'quit', id: 'quit', label: text('退出', 'Quit') },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Folio', submenu: items },
      { label: text('编辑', 'Edit'), submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: text('窗口', 'Window'), submenu: [{ role: 'minimize' }, { role: 'zoom' }, { label: text('显示 Folio', 'Show Folio'), click: showWindow }] },
    ]));
  }
  setMenu();
  session.defaultSession.cookies.on('changed', (event, cookie, cause, removed) => {
    if (!removed && cookie.name === 'folio_lang' && cookie.domain === 'localhost' && ['zh', 'en'].includes(cookie.value)) {
      language = cookie.value; setMenu();
    }
  });
  window.once('ready-to-show', showWindow);
  await window.loadURL(`${origin}/`);
  return { window, showWindow, stop, get origin() { return origin; } };
}

if (require.main === module) {
  startDesktop().catch((error) => { dialog.showErrorBox('Folio', error.message); app.exit(1); });
}
module.exports = { startDesktop };
