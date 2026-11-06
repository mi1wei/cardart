const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, setLang } = require('./ui-helpers.cjs');

const menuItem = (desktop, id) => desktop.evaluate(({ Menu }, id) => {
  const item = Menu.getApplicationMenu()?.getMenuItemById(id);
  return item && { enabled: item.enabled };
}, id);

test('the app opens on the home page, and unknown addresses show it without a redirect', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page).toHaveURL(`${origin}/`);
    await expect(page.locator('.home .h1')).toHaveText('Your photos, bound into a real album');
    await expect(page).toHaveTitle('Folio');
    // The menus follow the home page: albums can be created there, but no album can be changed.
    await expect.poll(() => menuItem(desktop, 'new-album')).toEqual({ enabled: true });
    await expect.poll(() => menuItem(desktop, 'add-photos')).toEqual({ enabled: false });
    for (const address of ['/#/', '/#/home', '/#/a/not-an-album']) {
      await page.goto(`${origin}${address}`);
      await expect(page).toHaveURL(`${origin}${address}`);
      await expect(page.locator('.home .h1')).toBeVisible();
    }
    // A phone's link carries its key in the query; the home page keeps it.
    await page.goto(`${origin}/?key=kept#/`);
    await expect(page).toHaveURL(`${origin}/?key=kept#/`);
    await expect(page.locator('.home .h1')).toBeVisible();
  } finally { await fixture.close(); }
});

test('the Home and Albums tabs show where you are, and the logo leads home', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Tabs', 1);
    const home = page.locator('.nav .nl[data-page=home]');
    const albums = page.locator('.nav .nl[data-page=albums]');
    await expect(home).toHaveText('Home');
    await expect(home).toHaveAttribute('aria-current', 'page');
    await expect(albums).not.toHaveAttribute('aria-current', 'page');
    await albums.click();
    await expect(page).toHaveURL(`${origin}/#/albums`);
    await expect(albums).toHaveAttribute('aria-current', 'page');
    await expect(home).not.toHaveAttribute('aria-current', 'page');
    for (const address of [`#/a/${album.id}`, '#/trash']) {
      await page.goto(`${origin}/${address}`);
      await expect(albums, address).toHaveAttribute('aria-current', 'page');
    }
    await page.goto(`${origin}/#/license`);
    await expect(page.locator('.nav [aria-current]')).toHaveCount(0);
    await page.locator('.nav .logo').click();
    await expect(page).toHaveURL(`${origin}/#/`);
    await expect(home).toHaveAttribute('aria-current', 'page');
    await setLang(page, 'zh');
    await expect(home).toHaveText('首页');
    await expect(albums).toHaveText('相册');
    await expect(home).toHaveAttribute('aria-current', 'page');
  } finally { await fixture.close(); }
});

test('home shows what Folio does, the newest non-empty albums and the library totals', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.home .h1')).toBeVisible();
    await expect(page.locator('.home .recent')).toBeHidden();
    await expect(page.locator('.eyebrow .stats')).toBeHidden();
    const albums = [];
    for (const [i, title] of ['One', 'Two', 'Three', 'Four', 'Five'].entries()) albums.push(await seed(page, origin, title, i + 1));
    await seed(page, origin, 'Empty', 0);
    // A new photo makes the oldest album the most recently updated one.
    const jpeg = await sharp({ create: { width: 99, height: 20, channels: 3, background: '#2f6fa3' } }).jpeg().toBuffer();
    expect((await page.request.post(`${origin}/api/albums/${albums[0].id}/photos?name=new.jpg`, {
      headers: { 'X-Album-Upload': '1' }, data: jpeg,
    })).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.eyebrow .stats .n')).toHaveText('6 albums · 16 photos');
    await expect(page.locator('.recent h2')).toHaveText('Recently updated');
    await expect(page.locator('.recent .folder h3')).toHaveText(['One', 'Five', 'Four', 'Three']);
    await expect(page.locator('.feat h3')).toHaveText([
      'Stays on your computer', 'Flip it like a real album', 'By capture time', 'Accidental deletes are recoverable',
    ]);
    await expect(page.locator('.foot')).toContainText('Your photos stay on this computer');
    await page.locator('.recent .folder').first().click();
    await expect(page).toHaveURL(`${origin}/#/a/${albums[0].id}`);
    await page.goBack();
    await page.locator('.home [data-act=phone]').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.cta.dark').click();
    await expect(page).toHaveURL(`${origin}/#/albums`);
    await expect(page.locator('.folder')).toHaveCount(6);
  } finally { await fixture.close(); }
});

test('the home book plays as a muted video, or stays a still picture when motion is reduced', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const video = page.locator('video.home-book');
    await expect(video).toHaveJSProperty('muted', true);
    await expect(video).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(() => video.evaluate((el) => el.readyState)).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('img.home-book')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
  } finally { await fixture.close(); }
});
