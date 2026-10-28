const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { createBackend } = require('./backend.cjs');

function bridge() {
  const child = new EventEmitter();
  child.postMessage = () => {};
  const backend = createBackend({
    fork: () => child, appRoot: '/test', profile: '/test', config: {},
    log: async () => {}, onExit: () => {},
  });
  return { child, backend };
}

test('native utility startup failures reject readiness instead of crashing the main process', async () => {
  const { child, backend } = bridge();
  child.emit('error', 'FatalError', 'node-service', {});
  await assert.rejects(backend.ready, { code: 'BACKEND_CRASH' });
});

test('a malformed utility ready message is rejected before a window can load it', async () => {
  const { child, backend } = bridge();
  child.emit('message', { type: 'ready', origin: 'https://example.com', port: 443 });
  await assert.rejects(backend.ready, /origin/i);
});
