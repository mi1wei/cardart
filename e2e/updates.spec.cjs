const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');

test('macOS hides the manual update entry from the app and tray menus for now', async () => {
  test.skip(process.platform !== 'darwin', 'macOS has no automatic updates');
  const fixture = await desktopFixture({ license: 'missing' });
  try {
    const { desktop } = await fixture.launch();
    expect(await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('updates') !== null)).toBe(false);
  } finally { await fixture.close(); }
});

test('the native update entry is usable while read-only and never opens the release page', async () => {
  test.skip(process.platform === 'darwin', 'macOS hides the manual update entry');
  const fixture = await desktopFixture({ license: 'missing' });
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    await desktop.evaluate(({ dialog, shell, Menu }) => {
      dialog.showMessageBox = async (...args) => {
        global.folioTestUpdateDialog = args.at(-1);
        return { response: 0 };
      };
      shell.openExternal = async (url) => { global.folioTestUpdateURL = url; };
      Menu.getApplicationMenu().getMenuItemById('updates').click();
    });
    await expect.poll(() => desktop.evaluate(() => global.folioTestUpdateDialog?.message || '')).not.toBe('');
    expect(await desktop.evaluate(() => global.folioTestUpdateURL)).toBeUndefined();
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
  } finally { await fixture.close(); }
});
