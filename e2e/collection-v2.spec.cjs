const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { openWall, seed } = require('./ui-helpers.cjs');

test('album and wall searches clear empty results, and sort choices persist', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const a = await seed(page, origin, 'Kyoto', 3);
    await seed(page, origin, 'Summer', 1);
    await openWall(page, origin);
    await page.locator('.wall-search').fill('KYOTO');
    await expect(page.locator('.folder')).toHaveCount(1);
    await page.locator('.wall-sort').selectOption('name');
    await page.reload();
    await expect(page.locator('.wall-sort')).toHaveValue('name');
    await page.goto(`${origin}/#/a/${a.id}`);
    await expect(page.locator('.tile')).toHaveCount(3);
    await page.locator('[data-act=search]').click();
    await page.locator('.album-search').fill('missing');
    await expect(page.locator('.tile')).toHaveCount(0);
    await expect(page.locator('.search-empty')).toBeVisible();
    await page.locator('.search-empty [data-act=clear-search]').click();
    await expect(page.locator('.tile')).toHaveCount(3);
    // Delay the real write to catch a reload that races persistence.
    await page.route(`${origin}/api/albums/${a.id}`, async (route) => {
      if (route.request().method() === 'PATCH') await new Promise((resolve) => setTimeout(resolve, 200));
      try { await route.continue(); }
      catch (error) { if (!/abort|closed|handled/i.test(error.message)) throw error; }
    });
    const [saved] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname === `/api/albums/${a.id}`),
      page.locator('.photo-sort').selectOption('added'),
    ]);
    expect(saved.ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.photo-sort')).toHaveValue('added');
  } finally { await fixture.close(); }
});

test('keyboard selection, copy to another album, delete undo and trash restore preserve photos', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const a = await seed(page, origin, 'Source', 3);
    const b = await seed(page, origin, 'Destination', 0);
    await page.goto(`${origin}/#/a/${a.id}`);
    await expect(page.locator('.tile')).toHaveCount(3);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await expect(page.locator('.tile.sel')).toHaveCount(3);
    await expect(page.locator('.batch-bar')).toBeVisible();
    await page.locator('.batch-bar [data-act=copy]').click();
    await page.locator(`.album-picker [data-target="${b.id}"]`).click();
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${b.id}`)).json()).photos.length).toBe(3);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await page.locator('.batch-bar [data-act=delete]').click();
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.tile')).toHaveCount(0);
    await page.locator('.undo-toast button').click();
    await expect(page.locator('.tile')).toHaveCount(3);
    await page.goto(`${origin}/#/albums`);
    await page.locator(`.folder[data-id="${b.id}"] [data-act=menu]`).click();
    await page.locator('.menu [data-act=delete]').click();
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.trash-card')).toBeVisible();
    await page.locator('.trash-card').click();
    await expect(page).toHaveURL(/#\/trash$/);
    await page.locator('.trash-item input').first().check();
    await page.locator('.trash-page [data-act=restore]').click();
    await expect(page.locator('.trash-item')).toHaveCount(0);
    expect((await (await page.request.get(`${origin}/api/albums/${b.id}`)).json()).photos).toHaveLength(3);
  } finally { await fixture.close(); }
});

test('filename and note search preserves a filtered range selection and prevents dragging', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const a = await seed(page, origin, 'Search', 4);
    const album = await (await page.request.get(`${origin}/api/albums/${a.id}`)).json();
    await page.request.patch(`${origin}/api/albums/${a.id}/photos/${album.photos[2].id}/note`, { data: { note: '京都 sunset', previousNote: '' } });
    await page.goto(`${origin}/#/a/${a.id}`);
    await expect(page.locator('.tile')).toHaveCount(4);
    await page.locator('[data-act=search]').click();
    await page.locator('.album-search').fill('SUNSET');
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.tile')).toHaveAttribute('data-id', album.photos[2].id);
    await page.locator('.album-search').fill('');
    await page.locator('.acts.normal [data-act=select]').click();
    await page.locator('.tile').nth(0).click();
    await page.locator('.tile').nth(2).click({ modifiers: ['Shift'] });
    await expect(page.locator('.tile.sel')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('.batch-bar')).toBeHidden();
    const persisted = await (await page.request.get(`${origin}/api/albums/${a.id}`)).json();
    expect(persisted.photos.map((p) => p.id)).toEqual(album.photos.map((p) => p.id));
  } finally { await fixture.close(); }
});

test('trash preview has only restore and purge, and permanent deletion asks for confirmation', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const a = await seed(page, origin, 'Trash preview', 1);
    await page.request.delete(`${origin}/api/albums/${a.id}`);
    await page.goto(`${origin}/#/trash`);
    await expect(page.locator('.trash-preview')).toHaveCount(1);
    await page.locator('.trash-preview').click();
    await expect(page.locator('.lb')).toBeVisible();
    await expect(page.locator('.lb [data-act=cover], .lb [data-act=delete]')).toHaveCount(0);
    await page.locator('.lb [data-act=close]').click();
    await page.locator('.trash-item input').check();
    await page.locator('[data-act=purge]').click();
    await expect(page.locator('dialog.dlg')).toBeVisible();
    await page.locator('dialog.dlg [data-act=cancel]').click();
    await expect(page.locator('.trash-item')).toHaveCount(1);
    await page.locator('[data-act=purge]').click();
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.trash-item')).toHaveCount(0);
    await expect(page.locator('.trash-empty')).toBeVisible();
  } finally { await fixture.close(); }
});

test('trash preview confirms purge once and cancellation leaves the preview open', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const a = await seed(page, origin, 'Purge preview', 1);
    await page.request.delete(`${origin}/api/albums/${a.id}`);
    await page.goto(`${origin}/#/trash`);
    await page.locator('.trash-preview').click();
    await page.locator('.lb [data-act=purge]').click();
    await page.locator('dialog.dlg [data-act=cancel]').click();
    await expect(page.locator('.lb')).toBeVisible();
    await page.locator('.lb [data-act=purge]').click();
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('dialog.dlg')).toHaveCount(0);
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.trash-item')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('capture date ranges appear on the album and card, and phone long-press opens selection', async () => {
  const fixture = await desktopFixture();
  try {
    const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const a = await seed(page, origin, 'Dates', 0);
    for (const [i, date] of ['2026:07:02 09:00:00', '2026:07:15 18:00:00'].entries()) {
      const data = await photoBytes({ width: 300 + i, height: 200, exif: { IFD2: { DateTimeOriginal: date } } });
      expect((await page.request.post(`${origin}/api/albums/${a.id}/photos?name=d${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data })).ok()).toBe(true);
    }
    await openWall(page, origin);
    await expect(page.locator('.folder .n')).toHaveText('2 photos');
    await expect(page.locator('.folder .folder-dates')).toHaveText('Jul 2026');
    expect(await page.locator('.pocket img').first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('4px');
    // A phone card with a long title: the count stays whole and the dates give way first.
    expect((await page.request.patch(`${origin}/api/albums/${a.id}`, { data: { title: 'A rather long album name for a narrow phone' } })).ok()).toBe(true);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.reload();
    const card = await page.locator('.folder').first().evaluate((el) => {
      const box = (selector) => el.querySelector(selector).getBoundingClientRect();
      const count = el.querySelector('.n');
      const title = el.querySelector('h3');
      return {
        countWhole: count.scrollWidth <= count.clientWidth,
        title: title.clientWidth, titleFull: title.scrollWidth, meta: el.querySelector('.meta').clientWidth,
        sameLine: Math.abs(box('.folder-dates').top - box('.n').top),
        inside: box('.folder-dates').right <= box('.meta').right + 0.5,
        ellipsis: getComputedStyle(el.querySelector('.folder-dates')).textOverflow,
      };
    });
    expect(card.countWhole).toBe(true);
    expect(card.title).toBeGreaterThanOrEqual(Math.min(card.titleFull, card.meta * 0.6));
    expect(card.sameLine).toBeLessThan(2);
    expect(card.inside).toBe(true);
    expect(card.ellipsis).toBe('ellipsis');
    await page.goto(`${origin}/#/a/${a.id}`);
    await expect(page.locator('.album-page .count')).toContainText('Jul 2 – 15, 2026');
    expect(await page.locator('.tile').first().evaluate((el) => getComputedStyle(el).boxShadow)).toContain('0px 0px 0px 2.5px');
    await page.locator('.tile').first().dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, pointerId: 7, clientX: 80, clientY: 300 });
    await expect(page.locator('.batch-bar')).toBeVisible();
    await page.locator('.tile').first().dispatchEvent('pointerup', { pointerType: 'touch', button: 0, pointerId: 7, clientX: 80, clientY: 300 });
    await expect(page.locator('.tile.sel')).toHaveCount(1);
    await expect(page.locator('.batch-bar [data-act=move]')).toHaveAccessibleName(/Move to|移动到/);
    await expect(page.locator('.batch-bar [data-act=download]')).toHaveAccessibleName(/Download|下载/);
    expect(await page.locator('.batch-bar').evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await page.locator('.batch-bar [data-act=move]').click();
    await expect(page.locator('.transfer-mode')).toBeVisible();
    await page.locator('.transfer-mode').selectOption('copy');
    await expect(page.locator('.transfer-mode')).toHaveValue('copy');
  } finally { await fixture.close(); }
});

test('batch download streams a ZIP through the native download flow', async () => {
  const fixture = await desktopFixture();
  try {
    const { readFile } = require('node:fs/promises');
    const { join } = require('node:path');
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const a = await seed(page, origin, 'Download', 2);
    await page.goto(`${origin}/#/a/${a.id}`);
    await expect(page.locator('.tile')).toHaveCount(2);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    const destination = join(fixture.root, 'selection.zip');
    await desktop.evaluate(({ session }, destination) => {
      global.folioDownload = null;
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(destination);
        item.once('done', (_event, state) => { global.folioDownload = { state, name: item.getFilename() }; });
      });
    }, destination);
    await page.locator('.batch-bar [data-act=download]').click();
    await expect.poll(() => desktop.evaluate(() => global.folioDownload?.state)).toBe('completed');
    const bytes = await readFile(destination);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes(Buffer.from('p0.jpg'))).toBe(true);
    expect(bytes.includes(Buffer.from('p1.jpg'))).toBe(true);
  } finally { await fixture.close(); }
});
