const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { openWall, seed, seedBook, setLang } = require('./ui-helpers.cjs');

test('on the computer, adding photos is called adding, not uploading', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Words', 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.acts.normal [data-act=upload]')).toHaveText('Add photos');
    await expect(page.locator('.photo-sort option[value=added]')).toHaveText('Date added');
    await setLang(page, 'zh');
    await expect(page.locator('.acts.normal [data-act=upload]')).toHaveText('添加照片');
    await expect(page.locator('.photo-sort option[value=added]')).toHaveText('添加时间');
    expect(await page.locator('main').innerText()).not.toContain('上传');
  } finally { await fixture.close(); }
});

test('sort pickers say what they sort and the thumbnail slider shows its range', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'A rather long album name for a narrow phone', 2);
    await openWall(page, origin);
    await expect(page.locator('.ph .sort-label > span')).toHaveText('Sort');
    await expect(page.locator('.wall-sort')).toHaveAccessibleName(/^Sort/);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.acts .sort-label > span')).toHaveText('Sort');
    await expect(page.locator('.photo-sort')).toHaveAccessibleName(/^Sort/);
    await expect(page.locator('.density svg')).toHaveCount(2);
    await expect(page.locator('.density')).toHaveAttribute('title', 'Thumbnail size');
    // A 320px phone in English: the header rows wrap instead of scrolling sideways.
    await page.setViewportSize({ width: 320, height: 700 });
    for (const hash of ['#/albums', `#/a/${album.id}`]) {
      await page.goto(`${origin}/${hash}`);
      await expect(page.locator('.sort-label').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await fixture.close(); }
});

test('the 3D book offers single, relaxed and compact layouts as one control', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seedBook(page, origin, 'Layouts', 12, 2);
    const perPage = async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`, { maxRetries: 1 })).json()).perPage;
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab canvas')).toBeVisible();
    const layout = page.locator('.ab-layout');
    await expect(layout).toHaveAttribute('aria-label', 'Layout');
    await expect(layout.locator('button')).toHaveText(['Single', 'Relaxed', 'Compact']);
    await expect(layout.locator('[data-per="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ab-select')).toBeHidden();
    await layout.locator('[data-per="3"]').click();
    await expect(layout.locator('[data-per="3"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(perPage).toBe(3);
    // The layout button keeps focus, yet the arrow keys still turn pages.
    const before = await page.locator('.ab-count').textContent();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.ab-count')).not.toHaveText(before);
    // The narrowest desktop window in English: the top bar still fits.
    await page.setViewportSize({ width: 720, height: 600 });
    await expect(page.locator('.ab-bar [data-act=cover]')).toBeVisible();
    expect(await page.evaluate(() => [...document.querySelectorAll('.ab-bar > *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 0.5))).toBe(true);
    // Phones keep a menu that reads "Layout · …".
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(layout).toBeHidden();
    await expect(page.locator('.ab-select > span')).toHaveText('Layout');
    await expect(page.locator('.ab-select select')).toHaveValue('3');
    await page.locator('.ab-select select').selectOption('1');
    await expect.poll(perPage).toBe(1);
  } finally { await fixture.close(); }
});

test('PDF export names the layout the same way as the 3D book', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Print', 2);
    await page.goto(`${origin}/#/a/${album.id}`);
    await page.locator('.album-page [data-act=menu]').click();
    await page.locator('[data-act=pdf]').click();
    const d = page.locator('dialog.pdf-export');
    await expect(d).toBeVisible();
    await expect(d.locator('.pdf-option:has([name=perPage])')).toContainText('Layout');
    await expect(d.locator('[name=perPage] option')).toHaveText(['Single', 'Relaxed', 'Compact']);
    await expect(d.locator('[name=perPage]')).toHaveValue('2');
    await d.locator('[data-act=cancel]').click();
    await expect(d).toHaveCount(0);
  } finally { await fixture.close(); }
});
