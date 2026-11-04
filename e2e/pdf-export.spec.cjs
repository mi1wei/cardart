const { test, expect } = require('@playwright/test');
const { _electron } = require('playwright');
const { generateKeyPairSync, sign, randomUUID } = require('node:crypto');
const { mkdir, writeFile, rm, readdir, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { seed } = require('./ui-helpers.cjs');
const { posterBytes, nativeVideo } = require('../tests/fixtures/video.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');

async function fixture() {
  const root = join(__dirname, `.pdf-e2e-${randomUUID()}`);
  const profile = join(root, 'profile');
  const downloads = join(root, 'downloads');
  await mkdir(profile, { recursive: true });
  await mkdir(downloads);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyFile = join(root, 'public.pem');
  await writeFile(keyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  const bytes = Buffer.from(JSON.stringify({
    license_id: 'pdf_e2e', plan: 'trial', device_id: null, features: ['album_write'], license_version: 1,
    expires_at: new Date(Date.now() + 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }));
  await writeFile(join(profile, 'license.json'), JSON.stringify({
    payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url'),
  }));
  let desktop;
  try {
    desktop = await _electron.launch({
      args: [join(__dirname, 'desktop-entry.cjs'), `--user-data-dir=${profile}`],
      env: { ...process.env, ALBUM_LIBRARY: join(root, 'library'), FOLIO_E2E_KEY_FILE: keyFile },
      chromiumSandbox: true, bypassCSP: false,
    });
    await expect.poll(() => desktop.evaluate(() => !!global.folioTestDesktop)).toBe(true);
    // The test owns this Downloads directory; never leave exports in a real user's Downloads.
    await desktop.evaluate(({ app }, path) => app.setPath('downloads', path), downloads);
    const page = await desktop.firstWindow();
    const origin = new URL(page.url()).origin;
    await desktop.context().addCookies([{ name: 'folio_lang', value: 'en', url: origin }]);
    await page.reload();
    return {
      desktop, page, origin, downloads,
      async close() {
        await desktop.evaluate(async () => { await global.folioTestDesktop.stop(); }).catch(() => {});
        await desktop.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await desktop?.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

test('sandboxed desktop exports real PDFs with distinct filenames and no renderer file paths', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, 'PDF Summer', 3);
    const heic = await f.page.request.post(`${f.origin}/api/albums/${album.id}/photos?name=print.heic`, {
      headers: { 'X-Album-Upload': '1' },
      data: await readFile(join(__dirname, '../tests/fixtures/photos/multi.heic')),
    });
    expect((await heic.json()).photo).toMatchObject({ w: 64, h: 48 });
    expect(await f.page.evaluate(() => typeof window.folioPDF?.export)).toBe('function');
    const results = await f.page.evaluate(async (id) => {
      const options = { paper: 'A4', perPage: 1, quality: 'high', cover: true, captions: true };
      return [
        await window.folioPDF.export({ requestId: crypto.randomUUID(), albumId: id, options, language: 'en' }),
        await window.folioPDF.export({ requestId: crypto.randomUUID(), albumId: id, options, language: 'en' }),
      ];
    }, album.id);
    expect(results.map((result) => result.name)).toEqual(['PDF Summer.pdf', 'PDF Summer (2).pdf']);
    expect(results.every((result) => result.token && !result.path)).toBe(true);
    for (const result of results) {
      const bytes = await readFile(join(f.downloads, result.name));
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(3000);
      expect((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length).toBe(5);
    }
    expect((await readdir(f.downloads)).every((name) => name.endsWith('.pdf'))).toBe(true);
    const printWindows = await f.desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((win) => new URL(win.webContents.getURL()).pathname === '/print.html').length);
    expect(printWindows).toBe(0);
  } finally { await f.close(); }
});

test('hash navigation tears down an open export dialog and its preview resources', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, 'Navigation', 1);
    await f.page.goto(`${f.origin}/#/a/${album.id}`);
    await f.page.locator('.album-page [data-act=menu]').click();
    await f.page.locator('[data-act=pdf]').click();
    await expect(f.page.locator('.pdf-export')).toBeVisible();
    await f.page.evaluate(() => { location.hash = '#/albums'; });
    await expect(f.page.locator('.pdf-export')).toHaveCount(0);
    await expect(f.page.locator('html')).not.toHaveAttribute('data-busy');
  } finally { await f.close(); }
});

test('export dialog updates preview, options and native progress without changing album settings', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, 'Preview Summer', 3);
    await f.page.request.patch(`${f.origin}/api/albums/${album.id}`, { data: { perPage: 1 } });
    await f.page.goto(`${f.origin}/#/a/${album.id}`);
    await f.page.locator('.album-page [data-act=menu]').click();
    await f.page.locator('[data-act=pdf]').click();
    const d = f.page.locator('dialog.pdf-export');
    await expect(d).toBeVisible();
    await expect(d.locator('[name=perPage]')).toHaveValue('1');
    await expect(d.locator('.pdf-page-count')).toContainText('4');
    await expect(d.locator('.pdf-preview .print-cover')).toHaveCount(1);
    await d.locator('[name=cover]').uncheck();
    await expect(d.locator('.pdf-page-count')).toContainText('3');
    await expect(d.locator('.pdf-preview .print-cover')).toHaveCount(0);
    await d.locator('[name=paper]').selectOption('Letter');
    await d.locator('[name=quality]').selectOption('high');
    await d.locator('[data-act=export]').click();
    await expect(f.page.locator('.pdf-saved')).toContainText('Preview Summer.pdf');
    await expect(f.page.locator('.pdf-saved button')).toBeVisible();
    expect((await (await f.page.request.get(`${f.origin}/api/albums/${album.id}`)).json()).perPage).toBe(1);
    await expect(f.page.locator('html')).not.toHaveAttribute('data-busy');
  } finally { await f.close(); }
});

test('print failures show a toast and closing an in-flight export leaves no partial files', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, 'Failure Summer', 2);
    await f.page.goto(`${f.origin}/#/a/${album.id}`);
    const open = async () => {
      await f.page.locator('.album-page [data-act=menu]').click();
      await f.page.locator('[data-act=pdf]').click();
    };
    await f.desktop.context().route('**/media/*/*/1600', (route) => route.abort());
    await open();
    await f.page.locator('.pdf-export [data-act=export]').click();
    await expect(f.page.locator('.toast:not([hidden])')).toContainText('PDF export failed');
    await expect(f.page.locator('.pdf-export [data-act=export]')).toBeEnabled();
    await expect(f.page.locator('html')).not.toHaveAttribute('data-busy');
    expect(await readdir(f.downloads)).toEqual([]);
    await f.desktop.context().unroute('**/media/*/*/1600');
    let release;
    await f.desktop.context().route('**/media/*/*/1600', async (route) => {
      await new Promise((resolve) => { release = resolve; });
      await route.abort().catch(() => {});
    });
    await f.page.locator('.pdf-export [data-act=export]').click();
    await expect(f.page.locator('html')).toHaveAttribute('data-busy', '');
    await f.page.locator('.pdf-export [data-act=cancel]').click();
    await expect(f.page.locator('.pdf-export')).toHaveCount(0);
    await expect(f.page.locator('html')).not.toHaveAttribute('data-busy');
    release?.();
    await expect.poll(async () => await readdir(f.downloads)).toEqual([]);
  } finally { await f.close(); }
});

test('browser-mode export uses the local print document and window.print, never native IPC', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, 'Browser Summer', 2);
    let prints = 0;
    await f.desktop.context().exposeBinding('folioTestPrint', () => { prints++; });
    await f.desktop.context().addInitScript(() => {
      window.print = () => {
        void window.folioTestPrint();
        window.dispatchEvent(new Event('afterprint'));
      };
    });

    const opened = f.desktop.waitForEvent('window');
    await f.desktop.evaluate(({ BrowserWindow }, url) => {
      global.folioBrowserTest = new BrowserWindow({
        show: true, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
      });
      void global.folioBrowserTest.loadURL(url);
    }, `${f.origin}/#/a/${album.id}`);
    const page = await opened;
    await expect(page.locator('.tile')).toHaveCount(2);
    expect(await page.evaluate(() => typeof window.folioPDF)).toBe('undefined');
    await page.locator('.album-page [data-act=menu]').click();
    await page.locator('[data-act=pdf]').click();
    await page.locator('.pdf-export [data-act=export]').click();
    await expect.poll(() => prints).toBe(1);
    await expect(page.locator('.pdf-export')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy');
    expect(await readdir(f.downloads)).toEqual([]);
    await f.desktop.evaluate(() => global.folioBrowserTest.destroy());
  } finally { await f.close(); }
});

test('Chinese preview prints only video posters, labels them and respects the captions toggle', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, '中文 <Summer>', 1);
    const poster = await posterBytes();
    const query = new URLSearchParams({ kind: 'video', name: 'clip.mp4', posterBytes: String(poster.length), w: '320', h: '180', duration: '2' });
    const videoResponse = await f.page.request.post(`${f.origin}/api/albums/${album.id}/photos?${query}`, {
      headers: { 'X-Album-Upload': '1' }, data: Buffer.concat([poster, await nativeVideo()]),
    });
    const video = (await videoResponse.json()).photo;
    expect(video.kind).toBe('video');
    await f.page.request.patch(`${f.origin}/api/albums/${album.id}`, { data: { cover: video.id, perPage: 1 } });
    const note = await f.page.request.patch(`${f.origin}/api/albums/${album.id}/photos/${video.id}/note`, {
      data: { note: '海边 <sunset>', previousNote: '' },
    });
    expect(note.ok()).toBe(true);
    await f.desktop.context().addCookies([{ name: 'folio_lang', value: 'zh', url: f.origin }]);
    await f.page.goto(`${f.origin}/#/a/${album.id}`);
    await f.page.reload();
    await f.page.locator('.album-page [data-act=menu]').click();
    await f.page.locator('[data-act=pdf]').click();
    const d = f.page.locator('.pdf-export');
    await expect(d).toHaveAttribute('aria-label', '导出 PDF');
    await expect(d.locator('.print-cover-video')).toHaveText('视频');
    await expect(d.locator('.print-video')).toHaveText('视频');
    await expect(d.locator('figcaption')).toHaveText('海边 <sunset>');
    await expect(d.locator('video')).toHaveCount(0);
    await expect(d.locator('.print-cover h1')).toHaveText('中文 <Summer>');
    await d.locator('[name=captions]').uncheck();
    await expect(d.locator('figcaption')).toHaveCount(0);
    await d.locator('[name=quality]').selectOption('high');
    const movieRequests = [];
    f.desktop.context().on('request', (request) => {
      if (request.url().endsWith(`/media/${album.id}/${video.id}/original`)) movieRequests.push(request.url());
    });
    await d.locator('[data-act=export]').click();
    await expect(f.page.locator('.pdf-saved')).toContainText('已保存到 下载/');
    expect(movieRequests).toEqual([]);
    expect((await readdir(f.downloads)).filter((name) => name.endsWith('.pdf'))).toHaveLength(1);
  } finally { await f.close(); }
});

test('the PDF cover writes the capture dates the way the rest of the app does', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, 'Dated', 0);
    for (const [i, date] of ['2026:07:12 19:02:11', '2026:07:15 08:00:00'].entries()) {
      const data = await photoBytes({ width: 300 + i, height: 200, exif: { IFD2: { DateTimeOriginal: date } } });
      expect((await f.page.request.post(`${f.origin}/api/albums/${album.id}/photos?name=d${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data })).ok()).toBe(true);
    }
    await f.page.goto(`${f.origin}/#/a/${album.id}`);
    await f.page.locator('.album-page [data-act=menu]').click();
    await f.page.locator('[data-act=pdf]').click();
    await expect(f.page.locator('.pdf-export .print-cover p')).toHaveText('Jul 12 – 15, 2026');
    await f.page.locator('.pdf-export [data-act=cancel]').click();
  } finally { await f.close(); }
});
