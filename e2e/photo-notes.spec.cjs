const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { desktopFixture } = require('./fixtures.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');

async function seed(fixture, note = '') {
  const { openLibrary } = await import('../server/library.js');
  const { importPhoto } = await import('../server/importer.js');
  const lib = await openLibrary(fixture.library);
  try {
    const album = await lib.create('Owned photo notes');
    for (const [name, options] of [['one.jpg', {}], ['two.png', { format: 'png', exif: null }]]) {
      await importPhoto(lib, album.id, Readable.from([await photoBytes({ width: 1200, height: 800, ...options })]), name);
    }
    if (note) await lib.updatePhotoNote(album.id, 'p001', { note, previousNote: '' });
    return lib.get(album.id);
  } finally { await lib.close(); }
}

async function launch(fixture, album, { lang = 'en', grid = false } = {}) {
  const launched = await fixture.launch();
  await launched.page.evaluate((value) => {
    localStorage.setItem('lang', value);
    localStorage.setItem('lightbox-details', 'true');
  }, lang);
  await launched.page.reload();
  const origin = new URL(launched.page.url()).origin;
  await launched.page.goto(`${origin}/#/a/${album.id}${grid ? '' : '/p/p001'}`);
  return { ...launched, origin };
}

test('a single multiline photo note persists across reload and app restart without changing original bytes', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seed(fixture);
    const file = join(fixture.library, 'albums', album.id, 'album.json');
    const original = join(fixture.library, 'albums', album.id, 'originals', album.photos[0].file);
    const before = await readFile(original);
    let { page, origin } = await launch(fixture, album);
    const panel = page.locator('.lb-details');
    await expect(panel).toBeVisible();
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-note-edit]').click();
    const caption = '清晨的湖边 🌿\n<img src=x onerror="window.noteExecuted=true">';
    await page.getByLabel('Note text', { exact: true }).fill(caption);
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.note-text')).toHaveText(caption);
    await expect(page.locator('.note-form')).toBeHidden();
    expect(await page.evaluate(() => window.noteExecuted)).toBeUndefined();
    await expect(page.locator('.photo-note img')).toHaveCount(0);
    expect(JSON.parse(await readFile(file, 'utf8')).photos[0].note).toBe(caption);
    expect(await readFile(original)).toEqual(before);
    await page.reload();
    await expect(page.locator('.note-text')).toHaveText(caption);
    await fixture.stop();
    ({ page, origin } = await launch(fixture, album));
    await expect(page.locator('.note-text')).toHaveText(caption);
    const saved = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(saved.photos[0].metadata).toEqual(album.photos[0].metadata);
    await page.screenshot({ path: test.info().outputPath('notes-desktop.png'), fullPage: true, scale: 'css' });
  } finally { await fixture.close(); }
});

test('mobile notes preserve compact default details, native editing keys, cancellation and explicit clear', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seed(fixture, '已有的照片备注');
    const { page } = await launch(fixture, album, { lang: 'zh' });
    for (const [width, height] of [[320, 740], [390, 844], [430, 932], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('.note-text')).toHaveText('已有的照片备注');
      expect(await page.evaluate(() => document.querySelector('.lb').scrollWidth <= innerWidth)).toBe(true);
      const image = await page.locator('.lb-stage').boundingBox();
      expect(image.height).toBeGreaterThan(100);
      const panel = await page.locator('.lb-details').boundingBox();
      expect(panel.y + panel.height).toBeCloseTo(height, 0);
      for (const selector of ['.lb-parameters', '.lb-gps', '.lb-file-properties']) {
        await expect(page.locator(selector)).not.toHaveAttribute('open', '');
      }
    }
    await page.setViewportSize({ width: 390, height: 600 });
    await page.locator('[data-note-edit]').click();
    const input = page.getByLabel('备注内容', { exact: true });
    await input.fill('这段草稿应该取消');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await page.locator('[data-note-cancel]').click();
    await expect(page.locator('.note-text')).toHaveText('已有的照片备注');
    await page.locator('[data-note-edit]').click();
    await page.locator('[data-note-clear]').click();
    await page.locator('[data-note-cancel]').click();
    await expect(page.locator('.note-text')).toHaveText('已有的照片备注');
    await page.locator('[data-note-edit]').click();
    await page.locator('[data-note-clear]').click();
    await page.locator('[data-note-save]').click();
    await expect(page.locator('[data-note-edit]')).toHaveText('添加备注');
    await page.reload();
    await expect(page.locator('[data-note-edit]')).toHaveText('添加备注');
    await page.locator('.lb-parameters summary').click();
    await expect(page.locator('.lb-parameters [data-field=exposure]')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('notes-mobile.png'), fullPage: true, scale: 'css' });
  } finally { await fixture.close(); }
});

test('failed and stale note saves retain the draft instead of overwriting another device', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seed(fixture, 'Original note');
    const { page, origin } = await launch(fixture, album);
    await page.locator('[data-note-edit]').click();
    const input = page.getByLabel('Note text', { exact: true });
    await input.fill('My unsaved draft');
    const endpoint = `${origin}/api/albums/${album.id}/photos/p001/note`;
    await page.route(endpoint, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Owned temporary failure' }) }));
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.note-error')).toContainText('Owned temporary failure');
    await expect(input).toHaveValue('My unsaved draft');
    await page.unroute(endpoint);
    expect((await page.request.patch(endpoint, { data: { note: 'Other device note', previousNote: 'Original note' } })).ok()).toBe(true);
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.note-error')).toContainText('changed elsewhere');
    await expect(input).toHaveValue('My unsaved draft');
    expect((await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).photos[0].note).toBe('Other device note');
    await page.locator('[data-note-cancel]').click();
    await expect(page.locator('.note-text')).toHaveText('Other device note');
    await page.locator('[data-note-edit]').click();
    await input.fill('a'.repeat(2001));
    await expect(page.locator('[data-note-save]')).toBeDisabled();
    await input.fill('Resolved draft');
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.note-text')).toHaveText('Resolved draft');
  } finally { await fixture.close(); }
});

test('unsaved notes guard photo changes and browser Back without leaking into another photo', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seed(fixture);
    const { page } = await launch(fixture, album, { grid: true });
    await page.locator('.tile').first().click();
    await page.locator('[data-note-edit]').click();
    const input = page.getByLabel('Note text', { exact: true });
    await input.fill('Keep this draft');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('.lb-nav.r').click();
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await expect(input).toHaveValue('Keep this draft');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.evaluate(() => history.back());
    await expect(input).toHaveValue('Keep this draft');
    await expect(page).toHaveURL(new RegExp(`/p/p001$`));
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.lb-nav.r').click();
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await expect(page.locator('[data-note-edit]')).toHaveText('Add note');
    await page.locator('.lb-nav.l').click();
    await expect(page.locator('[data-note-edit]')).toHaveText('Add note');
  } finally { await fixture.close(); }
});

test('read-only photos show saved notes but never expose note editing or empty EXIF blocks', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  try {
    const album = await seed(fixture, 'Readable without activation');
    const { page } = await launch(fixture, album);
    await expect(page.locator('.note-text')).toHaveText('Readable without activation');
    await expect(page.locator('[data-note-edit]')).toBeHidden();
    await page.locator('.lb-nav.r').click();
    await expect(page.locator('.photo-note')).toBeHidden();
    await expect(page.locator('[data-field=taken-at]')).toHaveCount(0);
    await expect(page.locator('.lb-gps')).toBeHidden();
  } finally { await fixture.close(); }
});

test('a pending note save cannot be abandoned or race another photo mutation', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  try {
    const album = await seed(fixture);
    const { page, origin } = await launch(fixture, album);
    await page.locator('.lb-nav.r').click();
    const endpoint = `${origin}/api/albums/${album.id}/photos/p002/note`;
    await page.route(endpoint, async (route) => {
      const response = await route.fetch();
      entered();
      await held;
      await route.fulfill({ response });
    });
    await page.locator('[data-note-edit]').click();
    await page.getByLabel('Note text', { exact: true }).fill('Pending saved note');
    await page.locator('[data-note-save]').click();
    await started;
    await expect(page.locator('.note-form')).toHaveAttribute('aria-busy', 'true');
    await page.locator('.lb-details [data-act=sheet-cover]').click();
    expect((await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).cover).toBe(null);
    await page.locator('.lb-nav.l').click();
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await page.locator('.lb [data-act=close]').click();
    await expect(page.locator('.lb')).toBeVisible();
    await page.evaluate(() => { location.hash = '#/albums'; });
    await expect(page).toHaveURL(new RegExp(`/p/p002$`));
    release();
    await expect(page.locator('.note-text')).toHaveText('Pending saved note');
    await expect(page.locator('.note-form')).toBeHidden();
  } finally { release(); await fixture.close(); }
});

test('an earlier cover save blocks note submission until its response cannot revert the new note', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  try {
    const album = await seed(fixture);
    const { page, origin } = await launch(fixture, album);
    await page.locator('.lb-nav.r').click();
    await page.locator('[data-note-edit]').click();
    const input = page.getByLabel('Note text', { exact: true });
    await input.fill('New note after cover');
    await page.route(`${origin}/api/albums/${album.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      entered();
      await held;
      await route.fulfill({ response });
    });
    await page.locator('.lb-details [data-act=sheet-cover]').click();
    await started;
    await expect(page.locator('[data-note-save]')).toBeDisabled();
    release();
    await expect(page.locator('[data-note-save]')).toBeEnabled();
    await expect(input).toHaveValue('New note after cover');
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.note-text')).toHaveText('New note after cover');
    const saved = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(saved.cover).toBe('p002');
    expect(saved.photos[1].note).toBe('New note after cover');
    await page.reload();
    await expect(page.locator('.note-text')).toHaveText('New note after cover');
  } finally { release(); await fixture.close(); }
});

test('incompatible metadata reaches validated Details fallback and a failed read leaves a usable note editor', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seed(fixture);
    const { openLibrary } = await import('../server/library.js');
    const lib = await openLibrary(fixture.library);
    try {
      await lib.save({ ...lib.get(album.id), photos: lib.get(album.id).photos.map((photo) => photo.id === 'p001' ?
        { ...photo, metadata: { ...photo.metadata, schemaVersion: 999, takenAt: { raw: 'incompatible' } } } : photo) });
    } finally { await lib.close(); }
    const { page } = await fixture.launch();
    await page.evaluate(() => { localStorage.setItem('lang', 'en'); localStorage.setItem('lightbox-details', 'true'); });
    await page.reload();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/#/a/${album.id}/p/p001`);
    await expect(page.locator('[data-field=camera]')).toHaveText('Folio Test Synthetic Camera');
    await expect(page.locator('[data-field=taken-at]')).toHaveText('Aug 15, 2026 09:30:00.125 +09:00');
    await page.route(`${origin}/api/albums/${album.id}/photos/p001/details`, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Owned read failure' }) }));
    await page.reload();
    await expect(page.locator('.lb-details-status')).toContainText('temporarily unavailable');
    await expect(page.locator('[data-field=file-name]')).toHaveText('one.jpg');
    await page.locator('[data-note-edit]').click();
    await expect(page.getByLabel('Note text', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
