const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');

test('third-party materials remain available from the native menu in read-only mode', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    await desktop.evaluate(({ shell, Menu }) => {
      shell.openPath = async (path) => { global.folioTestNoticePath = path; return ''; };
      Menu.getApplicationMenu().getMenuItemById('third-party-notices').click();
    });
    const path = await desktop.evaluate(() => global.folioTestNoticePath);
    expect(path).toBe(join(__dirname, '../licenses/THIRD_PARTY_NOTICES.txt'));
    expect(await readFile(path, 'utf8')).toContain('Third-party distribution materials');
  } finally { await fixture.close(); }
});
