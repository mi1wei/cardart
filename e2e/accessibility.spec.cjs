const { test, expect } = require('@playwright/test');
const { rm } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook, openWall, openSettings, setLang } = require('./ui-helpers.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');
const sharp = require('sharp');

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

async function targets(locator, minimum, surface) {
  const result = await locator.evaluateAll((elements, minimum) => {
    const visible = elements.filter(el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    return {
      count: visible.length,
      small: visible.map(el => {
        const { width, height } = el.getBoundingClientRect();
        return { control: el.getAttribute('aria-label') || el.className || el.textContent.trim(), width, height };
      }).filter(box => box.width < minimum || box.height < minimum),
    };
  }, minimum);
  expect(result.count, `${surface} has rendered controls`).toBeGreaterThan(0);
  expect.soft(result.small, surface).toEqual([]);
}

async function noOverflow(page, selector = 'html') {
  const bad = await page.locator(selector).evaluateAll(elements => elements.filter(el =>
    el.scrollWidth > el.clientWidth).map(el => ({ element: el.className || el.tagName, width: el.clientWidth, content: el.scrollWidth })));
  expect.soft(bad, `${selector} horizontal overflow`).toEqual([]);
}

async function separateControls(locator, surface) {
  const bad = await locator.evaluateAll(elements => {
    const boxes = elements.filter(el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
      .map(el => ({ name: el.getAttribute('aria-label') || el.className, box: el.getBoundingClientRect() }));
    const bad = [];
    for (let i = 0; i < boxes.length; i++) {
      const { name, box } = boxes[i];
      if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) bad.push({ outside: name });
      for (const other of boxes.slice(i + 1)) {
        if (Math.min(box.right, other.box.right) - Math.max(box.left, other.box.left) > .5 &&
            Math.min(box.bottom, other.box.bottom) - Math.max(box.top, other.box.top) > .5) {
          bad.push({ overlapping: [name, other.name] });
        }
      }
    }
    return bad;
  });
  expect.soft(bad, surface).toEqual([]);
}

test('desktop targets include the density slider, long-book slider and trash checkbox', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seedBook(page, origin, 'Desktop targets', 44, 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(44);
    await targets(page.locator('.back-link, .density input, .sort-label select'), 24, 'desktop album targets');
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab-slider')).toBeVisible();
    await targets(page.locator('.ab-slider'), 24, 'desktop long-book slider');
    await page.goto(`${origin}/#/a/${album.id}`);
    expect((await page.request.delete(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
    await page.goto(`${origin}/#/trash`);
    await expect(page.locator('.trash-item input')).toBeVisible();
    await targets(page.locator('.trash-item input'), 24, 'desktop trash checkbox');
  } finally { await fixture.close(); }
});

test('photo targets keep extreme-aspect thumbnails whole and bounded for both pointer types', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seedBook(page, origin, 'Extreme photo frames', 0, 1);
    for (const sample of [
      { name: 'wide', width: 2000, height: 50, bands: '<rect width="500" height="50" fill="red"/><rect x="1500" width="500" height="50" fill="blue"/>' },
      { name: 'tall', width: 50, height: 2000, bands: '<rect width="50" height="500" fill="red"/><rect y="1500" width="50" height="500" fill="blue"/>' },
    ]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sample.width}" height="${sample.height}"><rect width="100%" height="100%" fill="lime"/>${sample.bands}</svg>`;
      const data = await sharp(Buffer.from(svg)).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
      expect((await page.request.post(`${origin}/api/albums/${album.id}/photos?name=${sample.name}.jpg`, {
        headers: { 'X-Album-Upload': '1' }, data,
      })).ok()).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`${origin}/#/a/${album.id}`);
    const tiles = page.locator('.tile');
    await expect(tiles).toHaveCount(2);
    const session = await desktop.context().newCDPSession(page);
    for (const coarse of [false, true]) {
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: coarse, maxTouchPoints: 1 });
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse);
      await targets(tiles, coarse ? 44 : 24, `${coarse ? 'coarse' : 'fine'} extreme photo targets`);
      for (let i = 0; i < 2; i++) {
        const tile = tiles.nth(i);
        const box = await tile.boundingBox();
        expect.soft(box.height, 'A thin portrait must not become an unbounded page-height tile').toBeLessThanOrEqual(360);
        await expect.poll(() => tile.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        const { data, info } = await sharp(await tile.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let red = 0;
        let blue = 0;
        for (let p = 0; p < data.length; p += info.channels) {
          if (data[p] > 180 && data[p + 1] < 80 && data[p + 2] < 80) red++;
          if (data[p + 2] > 180 && data[p] < 80 && data[p + 1] < 80) blue++;
        }
        expect.soft(red, 'The first edge of the source photo remains visible').toBeGreaterThan(20);
        expect.soft(blue, 'The opposite edge of the source photo remains visible').toBeGreaterThan(20);
      }
    }
  } finally { await fixture.close(); }
});

for (const width of [320, 390]) {
  test(`coarse-pointer targets remain usable without overlap at ${width}px`, async () => {
    test.setTimeout(60_000);
    const fixture = await desktopFixture();
    try {
      const { page, desktop } = await fixture.launch();
      const session = await desktop.context().newCDPSession(page);
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      const origin = new URL(page.url()).origin;
      const count = width === 390 ? 44 : 3;
      const album = await seedBook(page, origin, 'A long album title for a small screen', count, 1);
      await page.setViewportSize({ width, height: 844 });
      await openWall(page, origin);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const controls = 'button, a[href], select, input[type=range], input[type=search]';
      await expect(page.locator('.folder')).toHaveCount(1);
      await targets(page.locator('.nav, .page').locator(controls), 44, 'coarse wall targets');
      await noOverflow(page);
      const menu = page.locator('.folder [data-act=menu]');
      const menuBox = await menu.boundingBox();
      await menu.click({ position: { x: 1, y: menuBox.height / 2 } });
      await expect(page.locator('.menu')).toBeVisible();
      await expect(page).toHaveURL(/#\/albums$/);
      await targets(page.locator('.menu button'), 44, 'coarse wall-menu targets');
      await page.mouse.click(width - 1, 200);
      const settings = await openSettings(page);
      await targets(settings.locator('button, a[href]'), 44, 'coarse Settings targets');
      await noOverflow(page, 'dialog.settings');
      await settings.locator('[data-act=done]').click();

      await page.goto(`${origin}/#/a/${album.id}`);
      await expect(page.locator('.tile')).toHaveCount(count);
      await targets(page.locator('.nav, .album-page').locator(controls), 44, 'coarse album targets');
      await noOverflow(page);
      await page.locator('.acts.normal [data-act=select]').click();
      await page.locator('.tile').first().click();
      await expect(page.locator('.batch-bar')).toBeVisible();
      await targets(page.locator('.batch-bar button'), 44, 'coarse photo batch targets');
      await noOverflow(page, '.batch-bar');
      await separateControls(page.locator('.batch-bar button'), 'photo batch hit areas');
      await page.locator('.batch-bar [data-act=cancel]').click();

      await page.goto(`${origin}/#/a/${album.id}/p/${album.photos[0].id}`);
      await expect(page.locator('.lb-zoom')).toBeVisible();
      await targets(page.locator('.lb-bar button, .lb-zoom button'), 44, 'coarse viewer targets');
      await targets(page.locator('.lb-filmstrip button'), 44, 'coarse filmstrip targets');
      await separateControls(page.locator('.lb-bar button, .lb-count'), 'viewer bar hit areas');
      await page.locator('.lb [data-act=details]').click();
      await expect(page.locator('.lb-details')).toBeVisible();
      await page.locator('[data-note-edit]').click();
      await targets(page.locator('.lb-details button, .lb-details summary'), 44, 'coarse details/note targets');
      await page.locator('[data-note-cancel]').click();

      await page.goto(`${origin}/#/a/${album.id}/3d`);
      await expect(page.locator('.ab-count')).not.toBeEmpty();
      await targets(page.locator('.ab-bar button, .ab-bar select, .ab-turn button'), 44, 'coarse 3D targets');
      if (width === 390) {
        await expect(page.locator('.ab-slider')).toBeVisible();
        await targets(page.locator('.ab-slider'), 44, 'coarse long-book slider');
      }
      await separateControls(page.locator('.ab-bar button, .ab-bar select, .ab-turn button'), '3D hit areas');
      await page.locator('.ab-turn [data-act=play]').click();
      await expect(page.locator('.ab-player')).toBeVisible();
      await targets(page.locator('.ab-player button'), 44, 'coarse 3D speed targets');
      await separateControls(page.locator('.ab-bar button, .ab-bar select, .ab-player button'), '3D playback hit areas');
      await page.locator('.ab-player [data-act=stop]').click();

      await page.goto(`${origin}/#/a/${album.id}`);
      expect((await page.request.delete(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
      await page.goto(`${origin}/#/trash`);
      const label = page.locator('.trash-item label');
      await expect(label).toBeVisible();
      await targets(label, 44, 'coarse trash checkbox label');
      const box = await label.boundingBox();
      await label.click({ position: { x: 1, y: box.height - 1 } });
      await expect(page.locator('.trash-item input')).toBeChecked();
      await expect(page.locator('.lb')).toHaveCount(0);
      await targets(page.locator('.trash-page button, .trash-page a[href]'), 44, 'coarse trash actions');
      await noOverflow(page);
      await noOverflow(page, '.batch-bar');
      await separateControls(page.locator('.batch-bar button'), 'trash batch hit areas');
      await page.locator('.trash-preview').first().click();
      await expect(page.locator('.lb')).toHaveAttribute('data-preview', 'true');
      await expect.soft(page.locator('.lb-back')).toHaveAccessibleName(
        'Back to Recently deleted, “A long album title for a small screen”', { timeout: 100 });
      await targets(page.locator('.lb-bar button'), 44, 'coarse trash-preview targets');
      await separateControls(page.locator('.lb-bar button, .lb-count'), 'trash preview hit areas');
      await page.locator('.lb-back').click();
      await expect(page.locator('.trash-item input')).toBeChecked();
    } finally { await fixture.close(); }
  });
}

test('a long library path stays readable in narrow Settings in both languages', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const session = await desktop.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    for (const language of ['zh', 'en']) {
      await setLang(page, language);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const settings = await openSettings(page);
        const path = settings.locator('.set-library-path');
        await expect(path).toHaveText(fixture.library);
        expect.soft((await path.boundingBox()).height, `${language} path at ${width}px fits within eight readable lines`).toBeLessThanOrEqual(160);
        await noOverflow(page, 'dialog.settings');
        await settings.locator('[data-act=done]').click();
      }
    }
  } finally { await fixture.close(); }
});

test('accessible names and headings track cover changes, live album rename and language', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seedBook(page, origin, 'Summer focus', 2, 1);
    await openWall(page, origin);
    await expect.soft(page.getByRole('heading', { name: 'Summer focus', level: 2 })).toBeVisible({ timeout: 100 });
    await page.goto(`${origin}/#/a/${album.id}`);
    const tiles = page.locator('.tile');
    await expect(tiles).toHaveCount(2);
    await expect.soft(tiles.first()).toHaveAccessibleName('p0.jpg, Cover', { timeout: 100 });
    await tiles.nth(1).click({ button: 'right' });
    await page.locator('.context-menu [data-context=cover]').click();
    await expect(tiles.nth(1).locator('.badge')).toHaveText('Cover');
    await expect(tiles.first()).toHaveAccessibleName('p0.jpg');
    await expect.soft(tiles.nth(1)).toHaveAccessibleName('p1.jpg, Cover', { timeout: 100 });
    await tiles.nth(1).click();
    await expect(page.locator('.lb-album-name')).toHaveText('Summer focus');
    await expect.soft(page.locator('.lb-back')).toHaveAccessibleName('Back to “Summer focus”', { timeout: 100 });
    await expect.soft(page.locator('.lb-zoom [data-act=actual]')).toHaveAccessibleName('1:1 Actual size', { timeout: 100 });
    expect((await page.request.patch(`${origin}/api/albums/${album.id}`, { data: { title: 'Renamed summer' } })).ok()).toBe(true);
    await page.locator('.lb [data-act=details]').click();
    await page.locator('[data-note-edit]').click();
    await page.locator('.note-input').fill('A note returns the updated album without rebuilding the viewer.');
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.lb-album-name')).toHaveText('Renamed summer');
    await expect.soft(page.locator('.lb-back')).toHaveAccessibleName('Back to “Renamed summer”', { timeout: 100 });
    await page.locator('.lb').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await expect.soft(page.locator('.lb-back')).toHaveAccessibleName('Back to “Renamed summer”', { timeout: 100 });
    await page.locator('.lb-back').click();
    await openWall(page, origin);
    await expect.soft(page.getByRole('heading', { name: 'Renamed summer', level: 2 })).toBeVisible({ timeout: 100 });
    await setLang(page, 'zh');
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect.soft(tiles.nth(1)).toHaveAccessibleName('p1.jpg，封面', { timeout: 100 });
    await tiles.nth(1).click();
    await expect.soft(page.locator('.lb-back')).toHaveAccessibleName('返回「Renamed summer」', { timeout: 100 });
    await expect.soft(page.locator('.lb-zoom [data-act=actual]')).toHaveAccessibleName('1:1 实际大小', { timeout: 100 });
  } finally { await fixture.close(); }
});
