const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const sharp = require('sharp');
const { seed, setRange } = require('./ui-helpers.cjs');

test('photos get a frame and the thumbnail size is remembered', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Frames', 3);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(3);
    expect(await page.locator('.tile').first().evaluate((el) => getComputedStyle(el).boxShadow)).toContain('0px 0px 0px 4px');
    const row = () => page.locator('.grid').evaluate((el) => getComputedStyle(el).getPropertyValue('--row').trim());
    expect(await row()).toBe('180px');
    await setRange(page.locator('.density input'), '0');
    await expect.poll(row).toBe('120px');
    await setRange(page.locator('.density input'), '2');
    await expect.poll(row).toBe('260px');
    await page.reload();
    await expect(page.locator('.tile')).toHaveCount(3);
    expect(await row()).toBe('260px');
    await expect(page.locator('.density input')).toHaveValue('2');
  } finally { await fixture.close(); }
});

test('loading shows placeholders instead of the empty drop zone', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Slow', 1);
    let release;
    let held = new Promise((resolve) => { release = resolve; });
    const albumRoute = new RegExp(`/api/albums/${album.id}$`);
    await page.route(albumRoute, async (route) => { await held; await route.continue(); });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.grid .skel').first()).toBeVisible();
    await expect(page.locator('.album-page .drop')).toBeHidden();
    release();
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.grid .skel')).toHaveCount(0);
    await page.unroute(albumRoute);

    held = new Promise((resolve) => { release = resolve; });
    await page.route(/\/api\/albums$/, async (route) => { await held; await route.continue(); });
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.folder-skel').first()).toBeVisible();
    await expect(page.locator('.folder')).toHaveCount(0);
    release();
    await expect(page.locator('.folder')).toHaveCount(1);
    await expect(page.locator('.folder-skel')).toHaveCount(0);
  } finally { await fixture.close(); }
});
