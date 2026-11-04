const assert = require('node:assert/strict');
const { test } = require('node:test');
const { desktopInfo, displayPath } = require('./desktop-info.cjs');

test('the library path shows the home folder as ~, except on Windows where ~ is not a convention', () => {
  assert.equal(displayPath('/Users/mi/Pictures/相册库', '/Users/mi', 'darwin'), '~/Pictures/相册库');
  assert.equal(displayPath('/Users/mi', '/Users/mi', 'darwin'), '~');
  assert.equal(displayPath('/Users/mia/Pictures', '/Users/mi', 'darwin'), '/Users/mia/Pictures'); // only whole folder names
  assert.equal(displayPath('/Volumes/Photos/相册库', '/Users/mi', 'darwin'), '/Volumes/Photos/相册库');
  assert.equal(displayPath('C:\\Users\\mi\\Pictures\\相册库', 'C:\\Users\\mi', 'win32'), 'C:\\Users\\mi\\Pictures\\相册库');
});

test('the settings info carries the version, the library as shown and the update state', () => {
  assert.deepEqual(
    desktopInfo({ version: '0.1.0', libraryDir: '/home/mi/相册库', home: '/home/mi', platform: 'linux', update: { phase: 'idle' } }),
    { version: '0.1.0', library: '~/相册库', update: { phase: 'idle' } },
  );
});
