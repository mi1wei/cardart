const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, style } = require('./ui-helpers.cjs');

test('the dark palette covers page surfaces and the lightbox stays light', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Dark check', 1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    expect(await style(page, 'body', 'backgroundColor')).toBe('rgb(18, 20, 23)');
    expect(await style(page, '.acts.normal .btn.pri', 'color')).toBe('rgb(15, 26, 32)');
    expect(await style(page, '.tile .badge', 'color')).toBe('rgb(28, 36, 48)');
    expect(await style(page, '.tile', 'backgroundColor')).toBe('rgb(34, 38, 43)');
    await page.locator('.album-page .title').click();
    await expect(page.locator('dialog.dlg')).toBeVisible();
    expect(await style(page, 'dialog.dlg', 'backgroundColor')).toBe('rgb(26, 29, 33)');
    await page.keyboard.press('Escape');
    await page.locator('.tile').click();
    await expect(page.locator('.lb')).toBeVisible();
    expect(await style(page, '.lb', 'backgroundColor')).toBe('rgb(245, 247, 249)');
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.folder')).toHaveCount(1);
    expect(await style(page, '.folder .pocket .back', 'backgroundImage')).toContain('rgb(38, 42, 47)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await style(page, 'body', 'backgroundColor')).toBe('rgb(247, 249, 251)');
  } finally { await fixture.close(); }
});
