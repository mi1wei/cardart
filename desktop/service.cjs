const { isAbsolute } = require('node:path');
const { readFile } = require('node:fs/promises');

let starting;
let runtime;
let closing;
const parent = process.parentPort;

function stop(code = 0) {
  closing ??= (async () => {
    await starting?.catch(() => {});
    await runtime?.close();
    parent.postMessage({ type: 'stopped' });
    setImmediate(() => process.exit(code));
  })();
  return closing;
}

parent.on('message', ({ data }) => {
  if (data?.type === 'stop') { void stop(); return; }
  if (data?.type !== 'start' || starting || closing) return;
  starting = (async () => {
    const config = data.config;
    if (!config || ![config.libraryDir, config.dist, config.licensePublicKeyFile, config.licenseFile].every((path) => typeof path === 'string' && isAbsolute(path))) throw new Error('Invalid backend paths');
    let publicKey;
    try { publicKey = await readFile(config.licensePublicKeyFile, 'utf8'); }
    catch (cause) { throw Object.assign(new Error('license-public-key-missing'), { code: 'LICENSE_PUBLIC_KEY_MISSING', cause }); }
    const { createLicenseStore } = await import('../server/license-store.js');
    const license = await createLicenseStore({
      file: config.licenseFile, publicKey,
      onChange(status) { parent.postMessage({ type: 'license-state', status }); },
    });
    const { startServer } = await import('../server/app.js');
    runtime = await startServer({
      dir: config.libraryDir, dist: config.dist, port: config.preferredPort,
      fallbackToRandomPort: true,
      license,
    });
    if (!closing) parent.postMessage({ type: 'ready', origin: new URL(runtime.url).origin, port: runtime.port });
  })();
  starting.catch((error) => {
    parent.postMessage({ type: 'fatal', code: error.code || 'BACKEND_FAILED', message: error.message });
    void stop(1);
  });
});
parent.on('close', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
