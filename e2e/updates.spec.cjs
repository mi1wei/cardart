const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');

test('the native update entry is usable while read-only and Mac opens only the fixed manual release page', async () => {
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
    if (process.platform === 'darwin') {
      await expect.poll(() => desktop.evaluate(() => global.folioTestUpdateURL)).toBe('https://github.com/mi1wei/cardart/releases');
    } else {
      expect(await desktop.evaluate(() => global.folioTestUpdateURL)).toBeUndefined();
    }
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
  } finally { await fixture.close(); }
});
