const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DEFAULT, MIN, restoreBounds, validWindow } = require('./window-state.cjs');

const main = { workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const right = { workArea: { x: 1440, y: 0, width: 1920, height: 1080 } };

test('a saved window needs whole-number bounds of at least 720 × 480 and a maximized flag', () => {
  assert.equal(validWindow({ x: 10, y: 40, width: 900, height: 600, maximized: false }), true);
  assert.equal(validWindow({ x: -1200, y: 40, width: 720, height: 480, maximized: true }), true);
  for (const bad of [null, {}, { x: 10, y: 40, width: 700, height: 600, maximized: false }, { x: 10, y: 40, width: 900, height: 479, maximized: false },
    { x: 10.5, y: 40, width: 900, height: 600, maximized: false }, { x: 10, y: 40, width: 900, height: 600 }, { x: '10', y: 40, width: 900, height: 600, maximized: false },
    { x: Infinity, y: 40, width: 900, height: 600, maximized: false }]) {
    assert.equal(validWindow(bad), false, JSON.stringify(bad));
  }
  assert.deepEqual([DEFAULT, MIN], [{ width: 1180, height: 800 }, { width: 720, height: 480 }]);
});

test('the saved place comes back while enough of the top bar is on a display', () => {
  const saved = { x: 100, y: 80, width: 900, height: 600, maximized: true };
  assert.deepEqual(restoreBounds(saved, [main]), saved);
  assert.deepEqual(restoreBounds({ ...saved, x: 2000 }, [main, right]), { ...saved, x: 2000 }); // the second display
  // A sliver of 40 px is not enough to grab the window.
  assert.equal(restoreBounds({ ...saved, x: 1440 - 40 }, [main]), null);
});

test('a place on a display that is gone, or nothing saved, gives the default', () => {
  assert.equal(restoreBounds({ x: -30000, y: -30000, width: 900, height: 600, maximized: false }, [main]), null);
  assert.equal(restoreBounds({ x: 2000, y: 100, width: 900, height: 600, maximized: false }, [main]), null); // the right display was unplugged
  assert.equal(restoreBounds(undefined, [main]), null);
  assert.equal(restoreBounds({ x: 0, y: 0, width: 10, height: 10, maximized: false }, [main]), null);
});
