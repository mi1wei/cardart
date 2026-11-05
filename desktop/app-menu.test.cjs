const assert = require('node:assert/strict');
const { test } = require('node:test');
const { appMenu, textMenu } = require('./app-menu.cjs');

const context = { page: 'albums', busy: false, appearance: 'dark', density: 'm' };
const find = (items, id) => items.flatMap((item) => [item, ...(item.submenu ? flatten(item.submenu) : [])]).find((item) => item.id === id);
const flatten = (items) => items.flatMap((item) => [item, ...(item.submenu ? flatten(item.submenu) : [])]);
const options = (send) => ({
  platform: 'darwin', text: (zh, en) => en, context, writable: true, enabled: true, updates: [], send,
  actions: { about() {}, reveal() {}, choose() {}, logs() {}, notices() {}, show() {} },
});

test('native menus dispatch command names, enable album-only actions and reflect preferences', () => {
  const sent = [];
  let menu = appMenu(options((name) => sent.push(name)));
  find(menu, 'new-album').click();
  assert.deepEqual(sent, ['new-album']);
  assert.equal(find(menu, 'add-photos').enabled, false);
  assert.equal(find(menu, 'density-l').enabled, false);
  assert.equal(find(menu, 'appearance-dark').checked, true);
  menu = appMenu({ ...options(() => {}), context: { ...context, page: 'album' } });
  assert.equal(find(menu, 'add-photos').enabled, true);
  assert.equal(find(menu, 'density-m').checked, true);
  assert.equal(find(appMenu({ ...options(() => {}), writable: false }), 'new-album').enabled, false);
});

test('Windows retains settings and help accelerators without a macOS application menu', () => {
  const menu = appMenu({ ...options(() => {}), platform: 'win32' });
  assert.equal(menu[0].label, 'File');
  assert.equal(find(menu, 'settings').accelerator, 'CmdOrCtrl+,');
  assert.equal(find(menu, 'shortcuts').accelerator, 'CmdOrCtrl+/');
  assert.equal(find(menu, 'reveal-library').label, 'Show Library in Explorer');
});

test('native edit menu appears only for text and preserves edit permission flags', () => {
  assert.equal(textMenu({ isEditable: false, selectionText: '' }), null);
  assert.deepEqual(textMenu({ isEditable: false, selectionText: 'selected' }).map((item) => item.role), ['copy', 'selectAll']);
  const editable = textMenu({ isEditable: true, selectionText: '', editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } });
  assert.equal(editable.find((item) => item.role === 'cut').enabled, false);
  assert.equal(editable.find((item) => item.role === 'paste').enabled, true);
});
