const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook } = require('./ui-helpers.cjs');

// Three photos at one a page: three pages, so spreads 1–3.
async function openBook(page) {
  const origin = new URL(page.url()).origin;
  const album = await seedBook(page, origin, 'Auto', 3, 1);
  await page.goto(`${origin}/#/a/${album.id}/3d`);
  await expect(page.locator('.ab-count')).toHaveText('1 / 3', { timeout: 15000 }); // three.js can take a while on a busy machine
  return { origin, album };
}

test('auto-flip turns spreads at the chosen speed, closes the book at the end and remembers the speed', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    const count = page.locator('.ab-count');
    await expect(page.locator('.ab-bar [data-act=close]')).toHaveText(/Back|返回/);
    await page.locator('.ab-turn [data-act=play]').click();
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await expect(page.locator('.ab-turn')).toBeHidden();
    await expect(page.locator('.ab-progress')).toBeVisible();
    await page.locator('.ab-speed [data-speed=fast]').click();
    await expect(page.locator('.ab-speed [data-speed=fast]')).toHaveAttribute('aria-pressed', 'true');
    const started = Date.now();
    await expect(count).toHaveText('2 / 3', { timeout: 6000 });
    expect(Date.now() - started).toBeGreaterThan(3000);
    await expect(count).toHaveText('3 / 3', { timeout: 6000 });
    await expect(page.locator('.ab-shut')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
    await expect(page.locator('.ab-progress')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('flip-speed'))).toBe('fast');
    await page.reload();
    await expect(count).toHaveText('1 / 3');
    await page.locator('.ab-turn [data-act=play]').click();
    await expect(page.locator('.ab-speed [data-speed=fast]')).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.close(); }
});

test('playing from the cover opens the book; Space pauses and resumes once; Escape stops before it closes', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    await page.locator('.ab-bar [data-act=cover]').click();
    await expect(page.locator('.ab-shut')).toBeVisible();
    await page.locator('.ab-shut [data-act=play]').click();
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await expect(page.locator('.ab-shut')).toBeHidden();
    await expect(page.locator('.ab-bar [data-act=cover]')).not.toHaveAttribute('hidden', '');
    await expect(page.locator('.ab-player [data-act=pause]')).toBeFocused();
    await page.keyboard.press(' ');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
    await expect(page.locator('.ab-player [data-act=pause]')).toHaveAttribute('aria-label', /Resume|继续/);
    await page.locator('.ab-speed [data-speed=fast]').click();
    await page.waitForTimeout(4500);
    await expect(page.locator('.ab-count')).toHaveText('1 / 3');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
    await page.keyboard.press(' ');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
    await expect(page.locator('.ab-turn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ab')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('opening a photo pauses auto-flip, and moving the mouse brings the faded controls back', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const { album } = await openBook(page);
    await page.locator('.ab-turn [data-act=play]').click();
    await page.mouse.move(5, 5);
    await expect(page.locator('.ab')).toHaveAttribute('data-idle', '', { timeout: 5000 });
    await expect.poll(() => page.locator('.ab-bar').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
    await page.mouse.move(300, 300);
    await expect(page.locator('.ab[data-idle]')).toHaveCount(0);
    await page.evaluate((hash) => { location.hash = hash; }, `#/a/${album.id}/3d/p/${album.photos[0].id}`);
    await expect(page.locator('.lb')).toBeVisible();
    await page.waitForTimeout(6500); // longer than one step at the default speed
    await page.locator('.lb [data-act=close]').click(); // Escape would close Details first
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.ab-count')).toHaveText('1 / 3');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
  } finally { await fixture.close(); }
});
