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

test('an empty library shows the welcome page and creates the first album from it', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const welcome = page.locator('.welcome');
    await expect(welcome).toBeVisible();
    await expect(welcome.locator('h2')).toHaveText('Welcome to Folio');
    await expect(welcome.locator('.welcome-lead')).toHaveText('Photos stay on this computer and are never uploaded to the cloud. Start by adding a few.');
    await expect(welcome.locator('.welcome-formats')).toContainText('MP4, MOV and M4V');
    await expect(page.locator('.wall-search')).toBeHidden();
    await expect(page.locator('.wall-sort')).toBeHidden();
    await expect(page.locator('.page > .ph .sub')).toBeHidden();
    await expect(page.locator('.welcome-trash')).toBeHidden();
    await welcome.locator('[data-act=new]').click();
    await page.locator('dialog.dlg input').fill('First album');
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page).toHaveURL(/#\/a\/[0-9a-f-]{36}$/);
    await expect(page.locator('.album-page .title')).toHaveText('First album');
    await page.goto(`${new URL(page.url()).origin}/#/albums`);
    await expect(page.locator('.folder')).toHaveCount(1);
    await expect(welcome).toBeHidden();
    await expect(page.locator('.wall-search')).toBeVisible();
  } finally { await fixture.close(); }
});

test('the welcome page links to Recently Deleted while it holds something', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Gone' } })).json();
    expect((await page.request.delete(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.welcome')).toBeVisible();
    await expect(page.locator('.folders .trash-card')).toHaveCount(0);
    const link = page.locator('.welcome-trash');
    await expect(link).toHaveText('Recently Deleted · 1 item · Cleared after 30 days');
    await link.click();
    await expect(page).toHaveURL(/#\/trash$/);
  } finally { await fixture.close(); }
});
