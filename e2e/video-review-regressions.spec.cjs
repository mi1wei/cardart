const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { seedMixed, openAlbum } = require('./video-fixtures.cjs');
const { nativeVideo } = require('../tests/fixtures/video.cjs');

async function keepOne(fixture, kind) {
  const album = await seedMixed(fixture);
  const { openLibrary } = await import('../server/library.js');
  const lib = await openLibrary(fixture.library);
  try {
    const gone = album.photos.find((item) => (item.kind === 'video') !== (kind === 'video'));
    return await lib.deletePhotos(album.id, [gone.id]);
  } finally { await lib.close(); }
}

for (const [kind, lostResponse] of [['photo', false], ['video', false], ['video', true]]) {
  test(`direct-URL last ${kind} deletion closes after commit (lost response: ${lostResponse})`, async () => {
    const fixture = await desktopFixture();
    try {
      const album = await keepOne(fixture, kind);
      const { page, origin } = await openAlbum(fixture, album, { suffix: `/p/${album.photos[0].id}` });
      await expect(page.locator('.lb')).toBeVisible();
      expect(await page.evaluate(() => !!history.state?.inApp)).toBe(false);
      if (lostResponse) await page.route(`${origin}/api/albums/${album.id}/photos/delete`, async (route) => {
        await route.fetch();
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Owned lost acknowledgement"}' });
      });
      await page.locator('.lb [data-act=delete]').click();
      await page.locator('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.locator('.lb')).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/a/${album.id}$`));
      await expect(page.locator('.album-page .drop')).toBeVisible();
      expect((await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).photos).toEqual([]);
    } finally { await fixture.close(); }
  });
}

for (const action of ['note', 'delete', 'rename']) {
  test(`late upload receipts preserve newer snapshots and do not duplicate or resurrect items (${action})`, async () => {
    const fixture = await desktopFixture();
    let releaseReceipt;
    const heldReceipt = new Promise((resolve) => { releaseReceipt = resolve; });
    let releaseRefresh;
    const heldRefresh = new Promise((resolve) => { releaseRefresh = resolve; });
    let committed;
    let refreshing = false;
    let refreshes = 0;
    try {
      const album = await keepOne(fixture, 'photo');
      const { page, origin } = await openAlbum(fixture, album);
      await page.route(/\/api\/albums\/[^/]+\/photos\?.*kind=video/, async (route) => {
        const response = await route.fetch();
        committed = (await response.json()).photo;
        await heldReceipt;
        await route.fulfill({ response });
      });
      await page.locator('.album-page input[type=file]').setInputFiles({
        name: 'pending.mp4', mimeType: 'video/mp4', buffer: await nativeVideo(),
      });
      await expect.poll(() => !!committed).toBe(true);
      if (action === 'rename') {
        await page.locator('.album-page .title').click();
        await page.locator('dialog input').fill('Renamed while the receipt was pending');
        await page.locator('dialog').getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('.album-page .title')).toHaveText('Renamed while the receipt was pending');
        releaseReceipt();
        await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
        await expect(page.locator('.grid .tile')).toHaveCount(2);
        expect(await page.locator('.grid .tile').evaluateAll((nodes) => nodes.map((node) => node.dataset.id))).toEqual([album.photos[0].id, committed.id]);
        await expect(page.locator('.album-page .count')).toHaveText('1 photo · 1 video');
        return;
      }
      await page.locator(`.tile[data-id="${album.photos[0].id}"]`).click();
      await page.locator('.lb-bar [data-act=details]').click();
      await page.locator('[data-note-edit]').click();
      await page.getByLabel('Note text', { exact: true }).fill('Snapshot already contains the upload');
      await page.locator('[data-note-save]').click();
      await expect(page.locator('.note-text')).toHaveText('Snapshot already contains the upload');
      await expect(page.locator('.grid .tile')).toHaveCount(2);
      await page.locator('.lb-nav.r').click();
      if (action === 'note') {
        await page.locator('[data-note-edit]').click();
        await page.getByLabel('Note text', { exact: true }).fill('Video note newer than its upload receipt');
        await page.locator('[data-note-save]').click();
        await expect(page.locator('.note-text')).toHaveText('Video note newer than its upload receipt');
        releaseReceipt();
        await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
        expect(await page.locator('.grid .tile').evaluateAll((nodes) => nodes.map((node) => node.dataset.id))).toEqual([album.photos[0].id, committed.id]);
        await page.locator('.lb [data-act=close]').click();
        await page.locator(`.tile[data-id="${committed.id}"]`).click();
        await expect(page.locator('.note-text')).toHaveText('Video note newer than its upload receipt');
        await expect(page.locator('.album-page .count')).toHaveText('1 photo · 1 video');
      } else {
        await page.locator('.lb [data-act=delete]').click();
        await page.locator('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.locator('.grid .tile')).toHaveCount(1);
        await expect(page.locator('.lb-count')).toHaveText('1 / 1');
        await page.route(`${origin}/api/albums/${album.id}`, async (route) => {
          if (route.request().method() !== 'GET' || ++refreshes !== 1) return route.continue();
          const response = await route.fetch();
          refreshing = true;
          await heldRefresh;
          await route.fulfill({ response });
        });
        releaseReceipt();
        await expect.poll(() => refreshing).toBe(true);
        await page.locator('[data-note-edit]').click();
        await page.getByLabel('Note text', { exact: true }).fill('Photo note after reconciliation started');
        await page.locator('[data-note-save]').click();
        await expect(page.locator('.note-text')).toHaveText('Photo note after reconciliation started');
        releaseRefresh();
        await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
        await expect(page.locator('.grid .tile')).toHaveCount(1);
        await expect(page.locator('.grid .tile-video')).toHaveCount(0);
        await page.locator('.lb [data-act=close]').click();
        await page.locator('.grid .tile').click();
        await expect(page.locator('.note-text')).toHaveText('Photo note after reconciliation started');
        await expect(page.locator('.album-page .count')).toHaveText('1 photo');
      }
    } finally { releaseReceipt(); releaseRefresh(); await fixture.close(); }
  });
}
