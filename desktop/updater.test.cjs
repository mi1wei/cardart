const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { createUpdateController } = require('./updater.cjs');
const { createLifecycle } = require('./lifecycle.cjs');

function fixture({ platform = 'win32', packaged = true, requestShutdown = async () => {} } = {}) {
  const updater = new EventEmitter();
  const calls = { checks: 0, downloads: 0, installs: [], dialogs: [], opened: 0 };
  const info = { version: '0.1.0-beta.2' };
  let answer = true;
  updater.checkForUpdates = async () => { calls.checks++; updater.emit('update-available', info); return { updateInfo: info }; };
  updater.downloadUpdate = async () => {
    calls.downloads++;
    updater.emit('download-progress', { percent: 42 });
    updater.emit('update-downloaded', info);
    return ['owned-installer-fixture'];
  };
  updater.quitAndInstall = (...args) => { calls.installs.push(args); };
  const states = [];
  const controller = createUpdateController({
    platform, packaged, updater, requestShutdown,
    showDialog: async (dialog) => { calls.dialogs.push(dialog); return answer; },
    openReleasePage: async () => { calls.opened++; },
    onChange: (state) => states.push(state),
  });
  return { updater, controller, calls, states, set answer(value) { answer = value; } };
}

test('Windows checks do not download or install, and ordinary quit can never install a cached update', async () => {
  const f = fixture();
  await f.controller.check({ interactive: false });
  assert.equal(f.controller.status().phase, 'available');
  assert.equal(f.calls.checks, 1);
  assert.equal(f.calls.downloads, 0);
  assert.equal(f.calls.installs.length, 0);
  assert.equal(f.calls.dialogs.length, 0);
  assert.equal(f.updater.autoDownload, false);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowPrerelease, true);
  assert.equal(f.updater.allowDowngrade, false);
});

test('a failed download is retryable and only a matching verified download event enables installation', async () => {
  const f = fixture();
  await f.controller.check({ interactive: false });
  f.updater.downloadUpdate = async () => {
    f.calls.downloads++;
    if (f.calls.downloads === 1) {
      const error = new Error('Owned network failure');
      f.updater.emit('error', error);
      throw error;
    }
    f.updater.emit('download-progress', { percent: 42 });
    f.updater.emit('update-downloaded', { version: '0.1.0-beta.2' });
    return ['owned-installer-fixture'];
  };
  await f.controller.download();
  assert.equal(f.controller.status().phase, 'error');
  assert.equal(f.controller.status().retry, 'download');
  await f.controller.download();
  assert.equal(f.calls.downloads, 2);
  assert.equal(f.controller.status().phase, 'downloaded');
  assert.ok(f.states.some((state) => state.phase === 'downloading' && state.percent === 42));
  assert.equal(f.calls.installs.length, 0);
});

test('confirmed installation drains once before running the installer, even after repeated menu clicks', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const reasons = [];
  const lifecycle = createLifecycle({ canHide: () => true, hide() {}, show() {}, stop: () => pending });
  const f = fixture({ requestShutdown: (reason) => { reasons.push(reason); return lifecycle.requestShutdown(reason); } });
  await f.controller.check({ interactive: false });
  await f.controller.download();
  const first = f.controller.install();
  const second = f.controller.install();
  await new Promise(setImmediate);
  assert.deepEqual(reasons, [{ reason: 'update' }]);
  assert.equal(f.calls.installs.length, 0);
  release();
  await Promise.all([first, second]);
  assert.equal(lifecycle.state, 'quitting');
  assert.deepEqual(f.calls.installs, [[false, true]]);
});

test('declining install preserves the running app and a failed drain never launches an installer', async () => {
  let drains = 0;
  const f = fixture({ requestShutdown: async () => { drains++; throw new Error('Owned drain failure'); } });
  await f.controller.check({ interactive: false });
  await f.controller.download();
  f.answer = false;
  await f.controller.install();
  assert.equal(drains, 0);
  assert.equal(f.controller.status().phase, 'downloaded');
  f.answer = true;
  await f.controller.install();
  assert.equal(drains, 1);
  assert.equal(f.calls.installs.length, 0);
  assert.equal(f.controller.status().phase, 'error');
  assert.equal(f.controller.status().terminal, true);
});

test('Mac always uses an explicit manual download entry, even without an application license', async () => {
  const f = fixture({ platform: 'darwin' });
  await f.controller.check();
  await f.controller.download();
  await f.controller.install();
  assert.equal(f.calls.checks, 0);
  assert.equal(f.calls.downloads, 0);
  assert.equal(f.calls.installs.length, 0);
  assert.equal(f.calls.opened, 3);
  assert.ok(f.calls.dialogs.every((dialog) => dialog.kind === 'manual'));
});

test('source development never contacts a real update feed', async () => {
  const f = fixture({ packaged: false });
  await f.controller.check();
  await f.controller.download();
  await f.controller.install();
  assert.equal(f.calls.checks, 0);
  assert.equal(f.calls.downloads, 0);
  assert.equal(f.calls.opened, 0);
  assert.ok(f.calls.dialogs.every((dialog) => dialog.kind === 'development'));
});

test('a mismatched downloaded version or an unsolicited event cannot turn an available update into an installer', async () => {
  const f = fixture();
  await f.controller.check({ interactive: false });
  f.updater.emit('update-downloaded', { version: '0.1.0-beta.2' });
  assert.notEqual(f.controller.status().phase, 'downloaded');
  f.updater.downloadUpdate = async () => { f.updater.emit('update-downloaded', { version: '0.1.0-beta.1' }); return []; };
  await f.controller.download();
  await f.controller.install();
  assert.equal(f.calls.installs.length, 0);
  assert.notEqual(f.controller.status().phase, 'downloaded');
});
