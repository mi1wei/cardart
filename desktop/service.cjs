const { isAbsolute } = require('node:path');

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
    if (!config || !isAbsolute(config.libraryDir) || !isAbsolute(config.dist)) throw new Error('Invalid backend paths');
    const { startServer } = await import('../server/app.js');
    runtime = await startServer({
      dir: config.libraryDir, dist: config.dist, port: config.preferredPort,
      fallbackToRandomPort: true,
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
