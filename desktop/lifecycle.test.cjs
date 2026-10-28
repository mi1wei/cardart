const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLifecycle } = require('./lifecycle.cjs');

function fixture({ canHide = true } = {}) {
  let visible = true;
  let stops = 0;
  let notices = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const lifecycle = createLifecycle({
    canHide: () => canHide,
    hide: () => { visible = false; },
    show: () => { visible = true; },
    stop: () => { stops++; return pending; },
    onFirstHide: () => { notices++; },
  });
  function close() {
    let prevented = false;
    lifecycle.onClose({ preventDefault() { prevented = true; } });
    return prevented;
  }
  return { lifecycle, close, release, get visible() { return visible; }, get stops() { return stops; }, get notices() { return notices; } };
}

test('closing hides and reopening restores the same running service, with one background notice', () => {
  const f = fixture();
  assert.equal(f.close(), true);
  assert.equal(f.visible, false);
  assert.equal(f.lifecycle.state, 'hidden');
  f.lifecycle.showMainWindow();
  assert.equal(f.visible, true);
  assert.equal(f.lifecycle.state, 'running');
  f.close();
  assert.equal(f.notices, 1);
  assert.equal(f.stops, 0);
});

test('a missing tray keeps the window visible instead of stranding the background service', () => {
  const f = fixture({ canHide: false });
  assert.equal(f.close(), true);
  assert.equal(f.visible, true);
  assert.equal(f.lifecycle.state, 'running');
  assert.equal(f.stops, 0);
  assert.equal(f.notices, 0);
});

test('explicit quit drains once, keeps close intercepted while saving, then permits destruction', async () => {
  const f = fixture();
  const first = f.lifecycle.requestShutdown({ reason: 'quit' });
  assert.equal(f.lifecycle.requestShutdown({ reason: 'quit' }), first);
  assert.equal(f.lifecycle.state, 'draining');
  assert.equal(f.close(), true);
  assert.equal(f.visible, true);
  await Promise.resolve();
  assert.equal(f.stops, 1);
  f.release();
  await first;
  assert.equal(f.lifecycle.state, 'quitting');
  assert.equal(f.close(), false);
});

test('update drain does not itself install or quit and rejects a competing shutdown reason', async () => {
  const f = fixture();
  const update = f.lifecycle.requestShutdown({ reason: 'update' });
  await assert.rejects(f.lifecycle.requestShutdown({ reason: 'quit' }), { code: 'SHUTDOWN_IN_PROGRESS' });
  f.release();
  await update;
  assert.equal(f.stops, 1);
  assert.equal(f.lifecycle.reason, 'update');
  assert.equal(f.lifecycle.state, 'quitting');
});
