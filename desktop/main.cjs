const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, session, ipcMain, screen } = require('electron');
const { mkdirSync, realpathSync } = require('node:fs');
const { readFile, writeFile, rename, rm } = require('node:fs/promises');
const { join, isAbsolute } = require('node:path');
const { loadSettings, saveSettings, resolveLibraryChoice } = require('./settings.cjs');
const { isAppURL, isAllowedPermission, isOriginalURL } = require('./security.cjs');
const { createBackend } = require('./backend.cjs');
const { createLog } = require('./log.cjs');
const { createLifecycle } = require('./lifecycle.cjs');
const { createTray } = require('./tray.cjs');
const { createUpdateController } = require('./updater.cjs');
const { createPdfExporter } = require('./pdf-export.cjs');
const { DEFAULT, MIN, restoreBounds, validWindow } = require('./window-state.cjs');

const RELEASES = 'https://github.com/mi1wei/cardart/releases';

async function startDesktop({ appRoot = join(__dirname, '..'), licensePublicKeyFile = join(__dirname, 'license-public.pem') } = {}) {
  app.setName('Folio');
  if (process.platform === 'win32') app.setAppUserModelId('io.github.mi1wei.folio');
  const selectedProfile = app.commandLine.getSwitchValue('user-data-dir');
  if (selectedProfile && !isAbsolute(selectedProfile)) throw new Error('user-data-dir must be absolute');
  const profile = selectedProfile || join(app.getPath('appData'), 'Folio');
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath('userData', realpathSync(profile));
  const quitRequested = app.commandLine.hasSwitch('quit');
  if (!app.requestSingleInstanceLock({ command: quitRequested ? 'quit' : 'show' }) || quitRequested) { app.quit(); return null; }
  let backend;
  let window;
  let origin;
  let tray;
  let licenseTimer;
  let quitJob;
  let updates;
  let choosingLibrary = false;
  let librarySwitchJob;
  let pdfExporter;
  let licenseStatus = { state: 'missing', canWrite: false };
  const stateFile = join(profile, 'runtime.json');
  const settingsFile = join(profile, 'desktop.json');
  const log = createLog(join(profile, 'logs/desktop.log'));
  let language;
  let settings;
  let metadata;
  // Settings are written one at a time; the window place and the appearance share this queue.
  let saving = Promise.resolve();
  let flushWindow = async () => {};
  function saveSoon() {
    saving = saving.then(() => saveSettings(settingsFile, settings)).catch((error) => log(`SETTINGS_SAVE ${error.message}`));
    return saving;
  }

  function revealWindow() {
    if (window?.isDestroyed()) return;
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  }
  function text(zh, en) { return language === 'zh' ? zh : en; }
  const lifecycle = createLifecycle({
    canHide: () => !!tray && !tray.isDestroyed(),
    hide: () => window.hide(),
    show: revealWindow,
    async stop() {
      await pdfExporter?.dispose();
      await librarySwitchJob?.catch(() => {});
      while (window && !window.isDestroyed() && !window.webContents.isDestroyed() &&
        window.webContents.getURL() && !window.webContents.isLoadingMainFrame()) {
        let busy;
        try { busy = await window.webContents.executeJavaScript('document.documentElement?.hasAttribute("data-busy") === true'); }
        catch { break; }
        if (!busy) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await flushWindow();
      await backend?.stop();
      await rm(stateFile, { force: true });
      await log('Folio stopped');
    },
    onFirstHide() {
      void dialog.showMessageBox({
        type: 'info',
        message: text('Folio 仍在菜单栏/托盘运行，手机可继续访问。要完全关闭，请选择“退出”。', 'Folio is still running in the menu bar/system tray, so your phone can stay connected. Choose Quit to stop it.'),
      }).catch((error) => { void log(error.message); });
    },
    onState(state) {
      if (state === 'draining' && window && !window.isDestroyed()) {
        revealWindow();
        window.setTitle(text('正在保存并退出 · Folio', 'Saving before quitting · Folio'));
        window.setEnabled(false);
        window.setProgressBar(2);
      }
      if (state === 'quitting') {
        clearInterval(licenseTimer);
        if (tray && !tray.isDestroyed()) tray.destroy();
      }
      if (window && !window.isDestroyed()) setMenu();
    },
  });
  function isStopping() { return ['draining', 'quitting'].includes(lifecycle.state); }
  function showWindow() { lifecycle.showMainWindow(); }
  function stop() { return lifecycle.requestShutdown({ reason: 'quit' }); }
  function quit() {
    if (lifecycle.reason === 'update' || quitJob) return;
    void log('Folio explicit quit requested');
    quitJob = stop().then(() => app.quit()).catch(async (error) => {
      await log(error.message);
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        message: text('退出清理失败，服务可能已停止，无法返回编辑。强制退出可能丢失未完成导入。', 'Shutdown failed and the service may already have stopped. Editing cannot resume; forcing quit may lose unfinished imports.'),
        buttons: [text('保留窗口', 'Keep Window'), text('强制退出', 'Force Quit')], cancelId: 0, defaultId: 0,
      });
      quitJob = null;
      if (response === 1) app.exit(1);
    });
  }
  app.on('second-instance', (event, argv, directory, data) => {
    void log(`Folio second-instance command: ${data?.command === 'quit' ? 'quit' : 'show'}`);
    if (data?.command === 'quit') quit();
    else showWindow();
  });
  app.on('activate', showWindow);
  app.on('before-quit', (event) => {
    if (lifecycle.state === 'quitting') return;
    event.preventDefault();
    quit();
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
  async function boot(explicitDir) {
    const { DEFAULT_DIR } = await import('../server/library.js');
    const choice = await resolveLibraryChoice({
      envDir: explicitDir || process.env.ALBUM_LIBRARY, storedDir: settings.libraryDir,
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
      onLicense(status) { licenseStatus = status; if (tray) setMenu(); },
      onExit(error) {
        void log(`${error.code || 'BACKEND_EXIT'} ${error.message}`);
        if (!isStopping()) {
          dialog.showErrorBox('Folio', text('相册服务已停止，请退出后重试。', 'The library service stopped. Quit and reopen Folio.'));
          void stop().then(() => app.quit());
        }
      },
    });
    try { origin = await backend.ready; }
    catch (error) { await backend.stop(); throw error; }
    settings = { ...settings, version: 1, libraryDir: dir, preferredPort: Number(new URL(origin).port || 80) };
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
  while (!isStopping()) {
    try { if (await boot()) break; await stop(); app.quit(); return null; }
    catch (error) {
      await backend?.stop();
      await log(`${error.code || 'STARTUP_ERROR'} ${error.message}`);
      if (error.code?.startsWith('LICENSE_PUBLIC_KEY_')) {
        dialog.showErrorBox('Folio', text('桌面应用缺少有效的授权公钥。请先运行签发工具并提供公钥，详见 docs/license-issuer.md。', 'Supply a valid license public key before building/running the desktop app. See docs/license-issuer.md.'));
        await stop(); app.quit(); return null;
      }
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
  if (isStopping()) return null;
  session.defaultSession.setPermissionCheckHandler((contents, permission, target) => isAllowedPermission(permission, target, origin));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(isAllowedPermission(permission, details.requestingUrl || contents.getURL(), origin));
  });
  const langCookie = await session.defaultSession.cookies.get({ url: origin, name: 'folio_lang' });
  if (isStopping()) return null;
  if (['zh', 'en'].includes(langCookie[0]?.value)) language = langCookie[0].value;
  const place = restoreBounds(settings.window, screen.getAllDisplays());
  window = new BrowserWindow({
    ...(place ? { x: place.x, y: place.y, width: place.width, height: place.height } : DEFAULT),
    minWidth: MIN.width, minHeight: MIN.height,
    title: 'Folio', backgroundColor: '#f7f9fb', show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false },
  });
  pdfExporter = createPdfExporter({
    ipcMain, BrowserWindow, owner: window, getOrigin: () => origin,
    downloads: () => app.getPath('downloads'), shell,
    canExport: () => !isStopping() && !choosingLibrary && licenseStatus.canWrite,
  });
  window.webContents.on('will-navigate', (event, target) => { if (!isAppURL(target, origin)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(({ url }) => isOriginalURL(url, origin) ? {
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 960, height: 720,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false },
    },
  } : { action: 'deny' });
  window.webContents.on('did-create-window', (preview) => {
    preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    preview.webContents.on('will-navigate', (event, target) => { if (!isOriginalURL(target, origin)) event.preventDefault(); });
    preview.webContents.on('will-attach-webview', (event) => event.preventDefault());
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  // Size and place are kept for the next launch (polish spec §6.5); full screen is not a place.
  let rememberTimer;
  function rememberWindow() {
    clearTimeout(rememberTimer);
    if (window.isDestroyed() || window.isFullScreen() || window.isMinimized()) return Promise.resolve();
    const { x, y, width, height } = window.getNormalBounds();
    const next = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), maximized: window.isMaximized() };
    if (!validWindow(next) || JSON.stringify(next) === JSON.stringify(settings.window)) return Promise.resolve();
    settings = { ...settings, window: next };
    return saveSoon();
  }
  const rememberSoon = () => { clearTimeout(rememberTimer); rememberTimer = setTimeout(rememberWindow, 500); };
  for (const event of ['move', 'resize', 'maximize', 'unmaximize']) window.on(event, rememberSoon);
  window.on('close', () => { void rememberWindow(); });
  flushWindow = async () => { await rememberWindow(); await saving; };
  window.on('close', lifecycle.onClose);
  const openPath = (path) => { void shell.openPath(path).then((error) => { if (error) dialog.showErrorBox('Folio', error); }); };
  async function showUpdateDialog({ kind, version, terminal }) {
    const messages = {
      manual: [text('手动更新 Folio', 'Update Folio manually'), text('请下载匹配芯片的 DMG，先从托盘退出 Folio，再覆盖应用。此未公证版本不自动安装。', 'Download the DMG for your chip, quit Folio from the tray, then replace the app. This non-notarized version does not install updates automatically.')],
      development: [text('开发模式不检查在线更新', 'Online updates are disabled in development'), text('Windows 自动更新仅用于安装版；源码运行不会联系真实更新源。', 'Windows automatic updates are available only in the packaged app. Source runs do not contact the update feed.')],
      available: [text(`Folio ${version} 可供下载`, `Folio ${version} is available`), text('请从更新菜单选择下载。不会自动下载或安装。', 'Choose Download from the update menu. Nothing is downloaded or installed automatically.')],
      current: [text('当前没有可用更新', 'No update is currently available'), ''],
      download: [text(`下载 Folio ${version}？`, `Download Folio ${version}?`), text('下载后仍需确认安装；普通关窗或退出不会安装更新。', 'Installation requires a separate confirmation. Closing or quitting normally will not install the update.')],
      install: [text(`安装 Folio ${version}？`, `Install Folio ${version}?`), text('当前导入将先完成，然后安全关闭相册服务并运行安装器，可能需要 UAC。取消 UAC 后可重新打开旧版。', 'Current imports finish first, then the library stops safely before the installer runs. UAC may be required; if declined, reopen the previous version.')],
      error: [text('未能完成更新', 'The update could not be completed'), terminal
        ? text('退出已开始，服务可能已停止，不能恢复编辑。强制退出可能丢失未完成导入。', 'Shutdown has started and the service may have stopped. Editing cannot resume; forcing quit may lose unfinished imports.')
        : text('原有相册和授权会保留。请检查网络或日志后重试；不会安装未完成校验的文件。', 'Your albums and license are preserved. Check the network or logs and retry. Unverified files will not be installed.')],
    };
    const [message, detail] = messages[kind];
    const confirm = ['manual', 'download', 'install'].includes(kind);
    const buttons = terminal
      ? [text('保留窗口', 'Keep Window'), text('强制退出', 'Force Quit')]
      : confirm ? [kind === 'manual' ? text('打开下载页', 'Open Downloads') : kind === 'download' ? text('下载', 'Download') : text('安装', 'Install'), text('取消', 'Cancel')]
        : [text('好', 'OK')];
    const result = await dialog.showMessageBox(window, { type: kind === 'error' ? 'warning' : confirm ? 'question' : 'info', message, detail, buttons, defaultId: confirm ? 1 : 0, cancelId: confirm ? 1 : 0 });
    if (terminal && result.response === 1) app.exit(1);
    return confirm && result.response === 0;
  }
  let updater;
  if (process.platform === 'win32' && app.isPackaged) {
    updater = require('electron-updater').autoUpdater;
    updater.logger = { info: (message) => { void log(message); }, warn: (message) => { void log(message); }, error: (message) => { void log(message); }, debug: () => {} };
  }
  updates = createUpdateController({
    platform: process.platform, packaged: app.isPackaged, updater,
    requestShutdown: lifecycle.requestShutdown, showDialog: showUpdateDialog,
    openReleasePage: () => shell.openExternal(RELEASES),
    log: (message) => { void log(message); },
    onChange(status) {
      if (window.isDestroyed()) return;
      window.setProgressBar(status.phase === 'downloading' ? (status.percent || 0) / 100 : -1);
      setMenu();
    },
  });
  function updateMenu() {
    const state = updates?.status() || { phase: 'idle' };
    // macOS has no automatic updates; its manual entry (open the releases page) is hidden for now.
    if (state.phase === 'manual') return [];
    const download = state.phase === 'available' || (state.phase === 'error' && state.retry === 'download');
    const install = state.phase === 'downloaded';
    const label = download ? text(`下载更新 ${state.version}`, `Download Update ${state.version}`)
      : install ? text(`安装更新 ${state.version}`, `Install Update ${state.version}`)
        : state.phase === 'checking' ? text('正在检查更新…', 'Checking for Updates…')
          : state.phase === 'downloading' ? text(`正在下载 ${Math.floor(state.percent || 0)}%`, `Downloading ${Math.floor(state.percent || 0)}%`)
            : state.phase === 'manual' ? text('下载新版', 'Download Updates') : text('检查更新', 'Check for Updates');
    return [{
      id: 'updates', label,
      enabled: !isStopping() && !['checking', 'downloading', 'installing'].includes(state.phase) && !state.terminal,
      click: () => { void (install ? updates.install() : download ? updates.download() : updates.check()).catch((error) => { void log(error.message); }); },
    }];
  }
  async function isImporting() {
    if (window.isDestroyed() || window.webContents.isDestroyed() || !window.webContents.getURL() || window.webContents.isLoadingMainFrame()) return false;
    return window.webContents.executeJavaScript('document.documentElement?.hasAttribute("data-busy") === true');
  }
  const waitForImport = () => dialog.showMessageBox({
    type: 'info',
    message: text('请等待当前导入完成，再选择相册库。', 'Wait for the current import to finish before changing libraries.'),
  });
  async function chooseAnotherLibrary() {
    if (choosingLibrary || isStopping()) return;
    choosingLibrary = true;
    setMenu();
    try {
      if (await isImporting()) { await waitForImport(); return; }
      const dir = await chooseLibrary(settings.libraryDir);
      if (!dir || isStopping()) return;
      window.setEnabled(false);
      if (await isImporting()) { await waitForImport(); return; }
      const previous = settings;
      librarySwitchJob = (async () => {
        pdfExporter.cancelAll();
        await backend.stop();
        if (isStopping()) return;
        settings = { ...settings, libraryDir: dir };
        try { await boot(dir); if (!isStopping()) await window.loadURL(`${origin}/`); }
        catch (error) {
          await backend?.stop();
          if (isStopping()) return;
          settings = previous;
          try { await boot(previous.libraryDir); if (!isStopping()) await window.loadURL(`${origin}/`); }
          catch (restoreError) {
            await backend?.stop();
            await dialog.showMessageBox({
              type: 'error',
              message: text('无法恢复原相册库，服务已停止。请退出后重试。', 'The previous library could not be restored. The service has stopped; quit and reopen Folio.'),
              detail: restoreError.message, buttons: [text('退出', 'Quit')],
            });
            quit();
            return;
          }
          if (!isStopping()) dialog.showErrorBox('Folio', error.message);
        }
      })();
      await librarySwitchJob;
    } catch (error) { dialog.showErrorBox('Folio', error.message); }
    finally {
      librarySwitchJob = null;
      choosingLibrary = false;
      if (!window.isDestroyed() && !isStopping()) window.setEnabled(true);
      setMenu();
    }
  }
  function setMenu() {
    const items = [
      { id: 'license', label: text('许可证', 'License'), enabled: !isStopping(), click: () => { showWindow(); void window.loadURL(`${origin}/#/license`); } },
      { label: text('打开相册库', 'Open Library'), click: () => openPath(settings.libraryDir) },
      { id: 'choose-library', label: text('选择相册库', 'Choose Library'), enabled: !isStopping() && !choosingLibrary, click: chooseAnotherLibrary },
      { label: text('打开日志', 'Open Logs'), click: () => openPath(join(profile, 'logs')) },
      { id: 'third-party-notices', label: text('第三方声明', 'Third-party Notices'), click: () => openPath(app.isPackaged ? join(process.resourcesPath, 'legal/THIRD_PARTY_NOTICES.txt') : join(appRoot, 'licenses/THIRD_PARTY_NOTICES.txt')) },
      ...updateMenu(),
      { type: 'separator' },
      { role: 'about', label: text('关于 Folio', 'About Folio') },
      { role: 'quit', id: 'quit', label: text('退出', 'Quit') },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Folio', submenu: items },
      { label: text('编辑', 'Edit'), submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: text('窗口', 'Window'), submenu: [{ role: 'minimize' }, { role: 'zoom' }, { label: text('显示 Folio', 'Show Folio'), click: showWindow }] },
    ]));
    if (tray && !tray.isDestroyed()) {
      const expired = licenseStatus.expiresAt && Date.now() >= Date.parse(licenseStatus.expiresAt);
      const writable = licenseStatus.state === 'active' && licenseStatus.canWrite && !expired;
      const status = writable
        ? licenseStatus.plan === 'trial' ? text('试用中', 'Trial active') : text('已授权', 'Licensed')
        : text('只读', 'Read-only');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: text('显示 Folio', 'Show Folio'), click: showWindow },
        { label: `${text('授权状态', 'License')}: ${status}`, enabled: false },
        { type: 'separator' }, ...items,
      ]));
    }
  }
  try { tray = createTray({ assetRoot: app.isPackaged ? join(process.resourcesPath, 'web') : join(appRoot, 'public'), showWindow }); }
  catch (error) {
    await log(`TRAY_UNAVAILABLE ${error.message}`);
    void dialog.showMessageBox({
      type: 'warning',
      message: text('无法创建托盘图标，关窗将保留窗口。请从应用菜单选择“退出”。', 'The tray is unavailable, so closing will keep the window visible. Use the application menu to quit.'),
    });
  }
  setMenu();
  licenseTimer = setInterval(() => { if (!isStopping()) setMenu(); }, 60000);
  licenseTimer.unref();
  session.defaultSession.cookies.on('changed', (event, cookie, cause, removed) => {
    if (!removed && cookie.name === 'folio_lang' && cookie.domain === 'localhost' && ['zh', 'en'].includes(cookie.value)) {
      language = cookie.value; setMenu();
    }
  });
  window.once('ready-to-show', () => {
    if (place?.maximized) window.maximize();
    showWindow();
  });
  try { await window.loadURL(`${origin}/`); }
  catch (error) { if (!isStopping()) throw error; }
  if (isStopping()) return null;
  if (process.platform === 'win32' && app.isPackaged) void updates.check({ interactive: false });
  return { window, tray, showWindow, stop, requestShutdown: lifecycle.requestShutdown, get origin() { return origin; } };
}

if (require.main === module) {
  startDesktop().catch((error) => { dialog.showErrorBox('Folio', error.message); app.exit(1); });
}
module.exports = { startDesktop };
