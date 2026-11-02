const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook } = require('./ui-helpers.cjs');

// Pixels in the middle column of the canvas that differ from the dark page colour (18, 20, 23).
async function bookHeight(page) {
  const png = await page.locator('.ab canvas').screenshot();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    const i = (y * info.width + x) * info.channels;
    if (Math.abs(data[i] - 18) + Math.abs(data[i + 1] - 20) + Math.abs(data[i + 2] - 23) > 60) n++;
  }
  return n;
}

// Two canvas frames 250 ms apart are the same: the camera has stopped gliding between pages.
async function settled(page) {
  const a = await page.locator('.ab canvas').screenshot();
  await page.waitForTimeout(250);
  return a.equals(await page.locator('.ab canvas').screenshot());
}

// Starts only once the camera rests, so the drag begins on the page in view.
async function swipe(page, from, to) {
  await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
  await page.mouse.move(from, 420);
  await page.mouse.down();
  await page.mouse.move(to, 420, { steps: 6 });
  await page.mouse.up();
}

test('an upright phone shows one page at a time, counts pages and goes back to spreads sideways', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const album = await seedBook(page, origin, 'Upright', 3, 1); // three pages plus the title page
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    const next = page.locator('.ab [data-act=next]');
    await expect(count).toHaveText('Page 2 of 5', { timeout: 15000 }); // three.js can take a while on a busy machine
    await expect(page.locator('.ab-rotate')).toHaveCount(0);
    await expect(page.locator('.ab canvas')).toBeVisible();
    // One page fills the width, so the page is about twice as tall as in the two-page view.
    await expect.poll(() => bookHeight(page), { timeout: 15000 }).toBeGreaterThan(240);
    await swipe(page, 300, 60); // turns the leaf: its back is the next page
    await expect(count).toHaveText('Page 3 of 5');
    await swipe(page, 300, 60); // nothing left to turn on a left page: move to the right page
    await expect(count).toHaveText('Page 4 of 5');
    await swipe(page, 90, 330); // back to the left page
    await expect(count).toHaveText('Page 3 of 5');
    await next.click();
    await expect(count).toHaveText('Page 4 of 5');
    await next.click();
    await expect(count).toHaveText('Page 5 of 5');
    await expect(next).toBeDisabled();
    await page.locator('.ab [data-act=prev]').click();
    await expect(count).toHaveText('Page 4 of 5');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(count).toHaveText('2 / 3');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(count).toHaveText('Page 4 of 5');
  } finally { await fixture.close(); }
});

test('auto-flip on an upright phone steps one page at a time and closes after the last page', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Upright play', 1, 1); // one page: title page + page 2 of 3
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab-count')).toHaveText('Page 2 of 3', { timeout: 15000 });
    await page.locator('.ab-turn [data-act=play]').click();
    await page.locator('.ab-speed [data-speed=fast]').click();
    await expect(page.locator('.ab-count')).toHaveText('Page 3 of 3', { timeout: 6000 });
    await expect(page.locator('.ab-shut')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
  } finally { await fixture.close(); }
});
