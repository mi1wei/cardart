const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');

test('the app opens on the album wall, and old or unknown addresses lead there too', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page).toHaveURL(`${origin}/#/albums`);
    await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');
    for (const address of ['/#/', '/#/home', '/#/a/not-an-album', '/']) {
      await page.goto(`${origin}${address}`);
      await expect(page).toHaveURL(`${origin}/#/albums`);
      await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');
    }
    // A phone's link carries its key in the query; rewriting the hash must keep it.
    await page.goto(`${origin}/?key=kept#/`);
    await expect(page).toHaveURL(`${origin}/?key=kept#/albums`);
  } finally { await fixture.close(); }
});
