const { test, expect } = require('@playwright/test');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');
const { posterBytes } = require('../tests/fixtures/video.cjs');

// Bundles one book module so a test can call it inside the page (same as video-book.spec).
async function serveModule(page, file, path) {
  const { build } = await import('vite');
  const root = join(__dirname, '..');
  const built = await build({ configFile: false, root, logLevel: 'silent',
    build: { lib: { entry: join(root, file), formats: ['es'] }, write: false, minify: false } });
  const outputs = Array.isArray(built) ? built : [built];
  const chunk = outputs.flatMap((output) => output.output).find((output) => output.type === 'chunk');
  await page.route(`**${path}`, (route) => route.fulfill({ contentType: 'text/javascript', body: chunk.code }));
}

async function darkPixels(page, box) {
  const png = await page.locator('.ab canvas').screenshot();
  const { data, info } = await sharp(png).extract(box).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] < 120) n++;
  return n;
}

test('the title page names the album with its date range and count, inside the cover', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 1280, height: 860 });
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Summer by the sea' } })).json();
    const files = [
      await photoBytes({ width: 300, height: 200, exif: { IFD2: { DateTimeOriginal: '2026:07:15 18:00:00' } } }),
      await photoBytes({ width: 301, height: 200, exif: { IFD2: { DateTimeOriginal: '2026:07:02 09:00:00' } } }),
      await photoBytes({ width: 302, height: 200, exif: null }),
    ];
    for (const [i, data] of files.entries()) {
      const res = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=d${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data });
      expect(res.ok()).toBe(true);
    }
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await page.locator('.nav [data-lang=en]').evaluate((el) => el.click());
    await page.reload();
    await expect(page.locator('.ab')).toHaveAccessibleDescription(/^July 2\D+15, 2026 · 3 photos$/);
    // The left page at spread 1 is the inside of the cover: the title page puts dark text there.
    await expect.poll(() => darkPixels(page, { left: 200, top: 300, width: 320, height: 260 }), { timeout: 15000 }).toBeGreaterThan(80);
    await page.locator('.ab [data-act=next]').click();
    await expect(page.locator('.ab-count')).toHaveText('2 / 2'); // three photos at two a page
  } finally { await fixture.close(); }
});

test('title page text leaves out a missing date range and cuts a long name to one line', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/title-page.js', '/__folio-title-test.js');
    const result = await page.evaluate(async () => {
      const { titlePageText, drawTitlePage } = await import('/__folio-title-test.js');
      const plain = titlePageText({ title: 'Screens', photos: [{ kind: 'photo', metadata: { takenAt: null } }, { kind: 'video' }] });
      const labels = [];
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 900;
      const ctx = canvas.getContext('2d');
      const fillText = ctx.fillText.bind(ctx);
      ctx.fillText = (text, ...rest) => { labels.push({ text, width: ctx.measureText(text).width }); return fillText(text, ...rest); };
      drawTitlePage(ctx, { title: 'A very long album name '.repeat(8).trim(), dates: '', count: '2 photos' }, 150, 150);
      return { plain, labels };
    });
    expect(result.plain.dates).toBe('');
    expect(result.plain.count).toMatch(/1 (photo|张照片) · 1 (video|个视频|段视频)/);
    expect(result.labels).toHaveLength(2);
    expect(result.labels[0].text.endsWith('…')).toBe(true);
    expect(result.labels[0].width).toBeLessThanOrEqual(150 - 24);
    expect(result.labels[1].text).toBe('2 photos');
  } finally { await fixture.close(); }
});
