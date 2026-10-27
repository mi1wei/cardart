const { join } = require('node:path');
const { createInterface } = require('node:readline');
const { parseReady } = require('./security.cjs');

function createBackend({ fork, appRoot, profile, config, log, onExit, onLicense }) {
  const child = fork(join(appRoot, 'desktop/service.cjs'), [], {
    cwd: profile, stdio: 'pipe', execArgv: [], serviceName: 'Folio Library',
  });
  let expected = false;
  let exited = false;
  let ready = false;
  let stopJob;
  for (const stream of [child.stdout, child.stderr]) {
    if (stream) createInterface({ input: stream }).on('line', (line) => { void log(line).catch(() => {}); });
  }
  const started = new Promise((resolve, reject) => {
    child.on('error', () => {
      const error = Object.assign(new Error('The Folio utility process failed'), { code: 'BACKEND_CRASH' });
      if (!ready) reject(error);
      else if (!expected) onExit(error);
    });
    child.on('message', (message) => {
      if (message?.type === 'fatal') {
        const error = Object.assign(new Error(message.message || 'Backend failed'), { code: message.code });
        if (!ready) reject(error);
        else onExit(error);
      } else if (message?.type === 'ready') {
        try { const origin = parseReady(message); ready = true; resolve(origin); }
        catch (error) { reject(error); }
      } else if (message?.type === 'license-state') onLicense?.(message.status);
    });
    child.once('exit', (code) => {
      exited = true;
      if (!ready) reject(new Error(`Folio backend exited before startup (${code})`));
      else if (!expected) onExit(new Error(`Folio backend exited unexpectedly (${code})`));
    });
  });
  child.postMessage({ type: 'start', config });
  return {
    child,
    ready: started,
    stop() {
      if (stopJob) return stopJob;
      expected = true;
      stopJob = exited ? Promise.resolve() : new Promise((resolve) => {
        child.once('exit', resolve);
        child.postMessage({ type: 'stop' });
      });
      return stopJob;
    },
  };
}

module.exports = { createBackend };
