const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

function trayFor(platform, missing = false) {
  class Tray extends EventEmitter {
    constructor(image) { super(); this.image = image; }
    setTitle(value) { this.title = value; }
    setToolTip(value) { this.tooltip = value; }
  }
  const electron = {
    Tray,
    nativeImage: {
      createEmpty: () => ({ isEmpty: () => true }),
      createFromPath: (path) => ({ path, isEmpty: () => missing, setTemplateImage() {} }),
    },
  };
  const module = { exports: {} };
  const file = join(__dirname, 'tray.cjs');
  runInNewContext(readFileSync(file, 'utf8'), {
    module, process: { platform }, require: (name) => name === 'electron' ? electron : require(name),
  }, { filename: file });
  return module.exports.createTray({ assetRoot: join('owned', 'assets'), showWindow() {} });
}

test('macOS uses a native Folio title without a menu-bar image', () => {
  const tray = trayFor('darwin');
  assert.equal(tray.title, 'Folio');
  assert.equal(tray.image.isEmpty(), true);
});

test('Windows retains its ICO image without a macOS title', () => {
  const tray = trayFor('win32');
  assert.equal(tray.image.path, join('owned', 'assets', 'favicon.ico'));
  assert.equal(tray.image.isEmpty(), false);
  assert.equal(tray.title, undefined);
});

test('a missing Windows icon still rejects an unusable tray', () => {
  assert.throws(() => trayFor('win32', true), /tray icon is missing/);
});
