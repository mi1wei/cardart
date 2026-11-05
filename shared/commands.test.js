import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandAllowed, normalizeContext } from './commands.js';

const album = { page: 'album', busy: false, appearance: 'auto', density: 'm' };

test('menu context accepts only valid pages, booleans and preferences', () => {
  assert.deepEqual(normalizeContext({ ...album, ignored: '/private/path' }), album);
  for (const bad of [null, [], { ...album, page: 'shell' }, { ...album, busy: 'yes' },
    { ...album, appearance: 'neon' }, { ...album, density: 3 }]) {
    assert.equal(normalizeContext(bad), null);
  }
});

test('unknown, readonly, busy and wrong-page commands cannot mutate albums', () => {
  for (const name of ['new-album', 'add-photos', 'import-folder', 'export-pdf']) {
    assert.equal(commandAllowed(name, album, true), true);
    assert.equal(commandAllowed(name, { ...album, busy: true }, true), false);
    assert.equal(commandAllowed(name, album, false), false);
  }
  for (const name of ['add-photos', 'export-pdf', 'density-l']) {
    assert.equal(commandAllowed(name, { ...album, page: 'albums' }, true), false);
  }
  assert.equal(commandAllowed('run-shell', album, true), false);
  assert.equal(commandAllowed('new-album', null, true), false);
});

test('readonly users can use appearance, density and help without changing the library', () => {
  for (const name of ['appearance-dark', 'settings', 'shortcuts', 'density-s']) {
    assert.equal(commandAllowed(name, { ...album, busy: true }, false), true);
  }
  assert.equal(commandAllowed('license', { ...album, busy: true }, true), false);
});
