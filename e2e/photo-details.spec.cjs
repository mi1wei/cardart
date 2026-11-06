const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { desktopFixture } = require('./fixtures.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');

async function language(page, lang) {
  await page.evaluate((value) => {
    localStorage.setItem('lang', value);
    localStorage.setItem('lightbox-details', 'true');
  }, lang);
  await page.reload();
}

async function seed(fixture, photos) {
  const { openLibrary } = await import('../server/library.js');
  const { importPhoto } = await import('../server/importer.js');
  const lib = await openLibrary(fixture.library);
  try {
    const album = await lib.create('Owned details');
    for (const [index, bytes] of photos.entries()) await importPhoto(lib, album.id, Readable.from([bytes]), `owned-${index + 1}.jpg`);
    const next = { ...lib.get(album.id), photos: lib.get(album.id).photos.map(({ metadata, ...photo }) => photo) };
    await lib.save(next);
    return next;
  } finally { await lib.close(); }
}

test('photo Details shows original dimensions and EXIF safely without changing the existing lightbox', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await language(page, 'en');
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Details upload' } })).json();
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.album-page .title')).toHaveText('Details upload');
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'false');
    const malicious = '<img src=x onerror="window.exifExecuted=true">';
    const file = {
      name: 'photo <one>.jpg', mimeType: 'image/jpeg',
      buffer: await photoBytes({ width: 2000, height: 3000, exif: { IFD0: { Make: malicious, Model: 'Owned Camera' } } }),
    };
    const [saved] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/albums/${album.id}/photos`),
      page.locator('.album-page input[type=file]').setInputFiles(file),
    ]);
    expect(saved.ok()).toBe(true);
    await expect(page.locator('.tile')).toHaveCount(1);
    await page.locator('.tile').click();
    const trigger = page.getByRole('button', { name: 'Details', exact: true });
    await expect(trigger).toBeVisible();
    const panel = page.locator('.lb-details');
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('[data-field=file-name]')).toHaveText('photo <one>.jpg');
    await expect(panel.locator('[data-field=dimensions]')).toHaveText('3000 × 2000');
    await expect(panel.locator('[data-field=format]')).toHaveText('JPEG');
    await expect(panel.locator('[data-field=taken-at]')).toHaveText('Aug 15, 2026 09:30:00.125 +09:00');
    await expect(panel.locator('[data-field=camera]')).toContainText(malicious);
    await expect(panel.locator('[data-field=location]')).toHaveText('0.000000, 0.000000');
    await expect(panel.locator('[data-field=exposure]')).toHaveText('1/200 s');
    await expect(panel.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => window.exifExecuted)).toBeUndefined();
    await expect(page.locator('.upload')).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('details-desktop.png') });
    await expect(page.locator('.lb-details [data-act=original]')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('.lb')).toBeVisible();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lb')).toHaveCount(0);
    await page.goto(`${origin}/#/a/${album.id}/3d/p/p001`);
    await expect(page.locator('.ab canvas')).toBeVisible();
    await expect(page.locator('.lb-details')).toBeVisible();
    await expect(page.locator('.lb-details [data-field=dimensions]')).toHaveText('3000 × 2000');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.ab canvas')).toBeVisible();
  } finally { await fixture.close(); }
});

test('read-only legacy Details supports mobile scrolling, unknown timezone and missing EXIF in Chinese', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  try {
    const album = await seed(fixture, [
      await photoBytes({ width: 1200, height: 800, exif: { IFD2: { DateTimeOriginal: '2026:08:15 00:30:00' } } }),
      await photoBytes({ format: 'png', exif: null }),
    ]);
    const albumFile = join(fixture.library, 'albums', album.id, 'album.json');
    const before = await readFile(albumFile);
    const { desktop, page } = await fixture.launch();
    await language(page, 'zh');
    await page.setViewportSize({ width: 390, height: 600 });
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/#/a/${album.id}/p/${album.photos[0].id}`);
    const trigger = page.getByRole('button', { name: '详情', exact: true });
    await expect(trigger).toBeVisible();
    const panel = page.locator('.lb-details');
    await expect(panel.locator('[data-field=taken-at]')).toHaveText('2026年8月15日 00:30:00（时区未记录）');
    await expect(panel.locator('.lb-file-properties')).not.toHaveAttribute('open', '');
    await panel.locator('.lb-file-properties summary').click();
    await expect(panel.locator('[data-field=file-modified-label]')).toHaveText('本地文件修改时间');
    // Stored in UTC, shown in this computer's time with the zone (polish spec §4.3).
    await expect(panel.locator('[data-field=file-modified]')).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}:\d{2} \S+/);
    await expect(page.locator('.lb [data-act=delete]')).toBeDisabled();
    const box = await panel.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    const imageBox = await page.locator('.lb-stage').boundingBox();
    expect(box.y + box.height).toBeCloseTo(600, 0);
    expect(box.y).toBeLessThan(imageBox.y + imageBox.height);
    await page.screenshot({ path: test.info().outputPath('details-mobile.png') });
    const count = await page.locator('.lb-count').textContent();
    await page.mouse.move(box.x + 40, box.y + 110);
    await page.mouse.down();
    await page.mouse.move(box.x + 170, box.y + 110, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('.lb-count')).toHaveText(count);
    expect(await panel.evaluate((element) => getComputedStyle(element).userSelect)).toBe('text');
    await panel.locator('[data-field=camera]').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.lb-count')).toHaveText(count);
    await page.evaluate(() => getSelection().removeAllRanges());
    await panel.evaluate((element) => { element.scrollTop = 0; });
    const session = await desktop.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const x = box.x + box.width - 30;
    const y = 520;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const distance of [25, 50, 90, 130]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('.lb-count')).toHaveText(count);
    await page.getByRole('button', { name: '详情', exact: true }).click();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: '详情', exact: true }).click();
    await expect(panel.locator('[data-field=taken-at]')).toHaveCount(0);
    await expect(panel.locator('[data-field=location]')).toHaveCount(0);
    await expect(panel.locator('.lb-details-status')).toContainText('EXIF');
    const withoutMetadata = (bytes) => JSON.parse(bytes).photos.map(({ metadata, ...photo }) => photo);
    expect(withoutMetadata(await readFile(albumFile))).toEqual(withoutMetadata(before));
  } finally { await fixture.close(); }
});

test('switching photos cannot let a delayed details response overwrite the current photo', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let finished;
  const completed = new Promise((resolve) => { finished = resolve; });
  try {
    const album = await seed(fixture, [
      await photoBytes(),
      await photoBytes({ exif: { IFD0: { Make: 'Second Make', Model: 'Second Camera' } } }),
    ]);
    const { page } = await fixture.launch();
    await language(page, 'en');
    const origin = new URL(page.url()).origin;
    await page.route(/\/photos\/p001\/details$/, async (route) => {
      try {
        const response = await route.fetch();
        entered();
        await held;
        await route.fulfill({ response });
      } catch (error) {
        if (!/abort|closed|invalid|cancel|handled/i.test(error.message)) throw error;
      } finally { finished(); }
    });
    await page.goto(`${origin}/#/a/${album.id}/p/${album.photos[0].id}`);
    const trigger = page.getByRole('button', { name: 'Details', exact: true });
    await expect(trigger).toBeVisible();
    await started;
    await expect(page.locator('.lb-details-status')).toHaveText('Reading photo details…');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-field=camera]')).toHaveText('Second Make Second Camera');
    release();
    await completed;
    await expect(page.locator('[data-field=camera]')).toHaveText('Second Make Second Camera');
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await page.locator('.lb-bar [data-act=close]').click();
    await expect(page.locator('.lb')).toHaveCount(0);
  } finally { release(); await fixture.close(); }
});
