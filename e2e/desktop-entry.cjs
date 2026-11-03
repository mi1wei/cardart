const path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');
if (process.env.CI) {
  // Allow software WebGL fallback on hosted runners without a usable GPU.
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  if (process.platform === 'win32') {
    // Keep browser compositing separate from software-rendered WebGL.
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', 'swiftshader-webgl');
  }
}
if (app.commandLine.hasSwitch('fixture-stop-failure')) {
  const backend = require('../desktop/backend.cjs');
  const createBackend = backend.createBackend;
  backend.createBackend = (options) => {
    const instance = createBackend(options);
    const stop = instance.stop;
    instance.stop = () => {
      if (global.folioTestFailNextStop) {
        global.folioTestFailNextStop = false;
        return Promise.reject(new Error('Owned backend stop failure'));
      }
      return stop();
    };
    return instance;
  };
}
if (app.commandLine.hasSwitch('fixture-runtime-save-failure')) {
  const fs = require('node:fs/promises');
  const rename = fs.rename;
  fs.rename = async (...args) => {
    if ((global.folioTestFailNextRuntimeSave || global.folioTestRuntimeSaveFailures > 0) && path.basename(args[1]) === 'runtime.json') {
      global.folioTestFailNextRuntimeSave = false;
      if (global.folioTestRuntimeSaveFailures > 0) global.folioTestRuntimeSaveFailures--;
      throw Object.assign(new Error('Owned runtime persistence failure'), { code: 'EACCES' });
    }
    return rename(...args);
  };
}
if (app.commandLine.hasSwitch('fixture-hold-initial-load')) {
  BrowserWindow.prototype.loadURL = () => new Promise((resolve, reject) => {
    global.folioTestInitialLoadReject = () => reject(new Error('ERR_ABORTED'));
  });
}
global.folioTestNotices = [];
const showMessageBox = dialog.showMessageBox;
dialog.showMessageBox = (...args) => {
  const options = args.at(-1);
  if (options.type !== 'info') return showMessageBox(...args);
  global.folioTestNotices.push(options.message);
  return Promise.resolve({ response: 0, checkboxChecked: false });
};
(async () => {
  const { startDesktop } = require('../desktop/main.cjs');
  global.folioTestDesktop = await startDesktop({
    appRoot: path.resolve(__dirname, '..'),
    licensePublicKeyFile: process.env.FOLIO_E2E_KEY_FILE,
  });
})().catch((error) => {
  console.error(error.code || error.message);
  process.exit(1);
});
