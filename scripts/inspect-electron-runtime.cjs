const { app } = require('electron');
const { mkdirSync } = require('node:fs');
const { isAbsolute } = require('node:path');

if (!app) throw new Error('Runtime inventory requires Electron, not system Node');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (!profile || !isAbsolute(profile)) throw new Error('Runtime inventory requires an isolated absolute user-data-dir');
mkdirSync(profile, { recursive: true, mode: 0o700 });
app.setPath('userData', profile);
app.whenReady().then(() => {
  console.log(JSON.stringify({
    ...Object.fromEntries(['electron', 'chrome', 'node', 'v8'].map((name) => [name, process.versions[name]])),
    platform: process.platform, arch: process.arch,
  }));
  app.quit();
}).catch((error) => { console.error(error.message); app.exit(1); });
