const path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');
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
