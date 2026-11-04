const { test, expect } = require('@playwright/test');
const { rm } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook, openWall, openSettings, setLang } = require('./ui-helpers.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');

async function readableText(page, surface) {
  const bad = await page.locator('body').evaluate((root) => {
    const leading = { 12: 16, 13: 18, 14: 20, 16: 24, 20: 28, 24: 32, 28: 36 };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const bad = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const el = node.parentElement;
      if (!node.textContent.trim() || !el || el.closest('.print-sheet, script, style') ||
          !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const css = getComputedStyle(el);
      const size = parseFloat(css.fontSize);
      if (!Object.hasOwn(leading, size) || parseFloat(css.lineHeight) !== leading[size]) {
        bad.push({ text: node.textContent.trim().slice(0, 60), element: el.className, size, line: css.lineHeight });
      }
    }
    return bad;
  });
  expect.soft(bad, surface).toEqual([]);
}

test('typography stays readable across pages, menus and dialogs in both languages', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.welcome')).toBeVisible();
    await readableText(page, 'welcome');
    const album = await seedBook(page, origin, 'A summer with a long album title', 1, 1);
    const imported = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=camera.jpg`, {
      headers: { 'X-Album-Upload': '1' }, data: await photoBytes({ width: 1200, height: 800 }),
    });
    expect(imported.ok()).toBe(true);
    const { photo } = await imported.json();
    const noted = await page.request.patch(`${origin}/api/albums/${album.id}/photos/${photo.id}/note`, {
      data: { note: 'A readable photo note\nwith a second line.', previousNote: '' },
    });
    expect(noted.ok()).toBe(true);
    for (const language of ['en', 'zh']) {
      await openWall(page, origin);
      await setLang(page, language);
      await expect(page.locator('.folder')).toHaveCount(1);
      await readableText(page, `${language} wall`);
      await expect.soft(page.locator('.folder :is(h2,h3)')).toHaveCSS('font-size', '16px', { timeout: 100 });
      await page.locator('.folder').click({ button: 'right' });
      await expect(page.locator('.context-menu')).toBeVisible();
      await readableText(page, `${language} context menu`);
      await expect.soft(page.locator('.context-menu')).toHaveCSS('border-radius', '12px', { timeout: 100 });
      await page.keyboard.press('Escape');

      const settings = await openSettings(page);
      await readableText(page, `${language} Settings`);
      await settings.locator('[data-act=shortcuts]').click();
      await expect(page.locator('dialog.shortcuts')).toBeVisible();
      await readableText(page, `${language} help`);
      await page.keyboard.press('Escape');

      await page.goto(`${origin}/#/license`);
      await expect(page.locator('.license-status-title')).toBeVisible();
      await page.locator('.license-json-details summary').click();
      await page.locator('.license-help-details summary').click();
      await readableText(page, `${language} License`);
      await expect.soft(page.locator('.license-status-title')).toHaveCSS('font-size', '24px', { timeout: 100 });

      await page.goto(`${origin}/#/a/${album.id}`);
      await expect(page.locator('.tile')).toHaveCount(2);
      await readableText(page, `${language} album`);
      await expect.soft(page.locator('.tile').first()).toHaveCSS('border-radius', '4px', { timeout: 100 });
      await page.locator('.album-page [data-act=menu]').click();
      await page.locator('[data-act=pdf]').click();
      await expect(page.locator('dialog.pdf-export')).toBeVisible();
      await readableText(page, `${language} PDF controls`);
      await expect.soft(page.locator('dialog.pdf-export')).toHaveCSS('border-radius', '20px', { timeout: 100 });
      await page.locator('.pdf-export [data-act=cancel]').click();

      await page.goto(`${origin}/#/a/${album.id}/p/${photo.id}`);
      await expect(page.locator('.lb')).toBeVisible();
      if (!await page.locator('.lb-details').isVisible()) await page.locator('.lb [data-act=details]').click();
      await expect(page.locator('.lb-details')).toBeVisible();
      await page.locator('.lb-file-properties summary').click();
      await readableText(page, `${language} photo details`);
      await page.locator('[data-note-edit]').click();
      await expect(page.locator('.note-input')).toBeVisible();
      await readableText(page, `${language} note editor`);
      await expect.soft(page.locator('.note-input')).toHaveCSS('line-height', '18px', { timeout: 100 });
      await page.locator('[data-note-cancel]').click();
      await page.locator('.lb-back').click();
    }
  } finally { await fixture.close(); }
});

test('narrow read-only typography keeps the photo count, note and License status readable', async () => {
  const fixture = await desktopFixture();
  try {
    let { page } = await fixture.launch();
    let origin = new URL(page.url()).origin;
    const album = await seedBook(page, origin, 'Small screen', 2, 1, { 0: 'A retained note' });
    await fixture.stop();
    await rm(join(fixture.profile, 'license.json'));
    ({ page } = await fixture.launch());
    origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`${origin}/#/a/${album.id}/p/${album.photos[0].id}`);
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    await page.locator('.lb [data-act=details]').click();
    await expect(page.locator('.note-readonly')).toBeVisible();
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await readableText(page, 'narrow readonly photo');
    await page.locator('.lb-back').click();
    await page.goto(`${origin}/#/license`);
    await expect(page.locator('.license-status-title')).toBeVisible();
    await readableText(page, 'narrow License');
    await expect.soft(page.locator('.license-status-title')).toHaveCSS('font-size', '24px', { timeout: 100 });
  } finally { await fixture.close(); }
});
