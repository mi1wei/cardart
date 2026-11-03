const { test, expect } = require('@playwright/test');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');
const { launchProbe, openAlbum, seedMixed } = require('./video-fixtures.cjs');
const { posterBytes } = require('../tests/fixtures/video.cjs');

async function restVideoPoint(page, album) {
  const { DIM, POCKET, layoutPages, pocketX } = await import('../src/book/layout.js');
  const { binderSize, binderPose } = await import('../src/book/binder.js');
  const { createSheet, restHoleAngle } = await import('../src/book/sheet.js');
  const { PerspectiveCamera, Texture, Vector3 } = await import('three');
  const pages = layoutPages(album.photos.map((item) => item.w / item.h), album.perPage);
  expect(pages).toHaveLength(2);
  const rect = pages[1].rects.find((rect) => rect.i === 1);
  const size = binderSize(1);
  const { C } = binderPose(1, size.D, size.xb);
  const sheet = createSheet(new Texture(), new Texture());
  sheet.update(C, size.R, Math.PI - restHoleAngle(C[1], size.R, DIM.T / 2), Math.PI, 0);
  const x = pocketX(1) + POCKET.pad + rect.x + rect.w / 2;
  const y = DIM.top + POCKET.pad + rect.y + rect.h / 2;
  const u = 1 - x / DIM.W;
  const uv = sheet.front.geometry.attributes.uv;
  const position = sheet.front.geometry.attributes.position;
  const count = position.count / 2;
  let i = 0;
  while (i + 1 < count - 1 && uv.getX(i + 1) < u) i++;
  const fraction = (u - uv.getX(i)) / (uv.getX(i + 1) - uv.getX(i));
  const world = new Vector3(
    position.getX(i) + fraction * (position.getX(i + 1) - position.getX(i)),
    position.getY(i) + fraction * (position.getY(i + 1) - position.getY(i)),
    y - DIM.H / 2,
  );
  sheet.dispose();
  const box = await page.locator('.ab canvas').boundingBox();
  const insets = await page.evaluate(() => ({
    top: document.querySelector('.ab-bar').offsetHeight,
    bottom: document.querySelector('.ab-foot').offsetHeight,
  }));
  const tan = Math.tan(12 * Math.PI / 180);
  const tilt = 9 * Math.PI / 180;
  const band = Math.max(0.3, (box.height - insets.top - insets.bottom) / box.height);
  const distance = Math.max((size.xb + size.B + 12) / (tan * box.width / box.height), (DIM.HB + 30) / 2 / (tan * band));
  const camera = new PerspectiveCamera(24, box.width / box.height, 50, 4000);
  camera.position.set(0, 4 + distance * Math.cos(tilt), distance * Math.sin(tilt));
  camera.lookAt(0, 4, 0);
  camera.setViewOffset(box.width, box.height, 0, (insets.bottom - insets.top) / 2, box.width, box.height);
  camera.updateMatrixWorld();
  world.project(camera);
  return { x: box.x + (world.x + 1) * box.width / 2, y: box.y + (1 - world.y) * box.height / 2 };
}

test('book textures distinguish video with a painted marker/duration and never redraw after disposal', async () => {
  const fixture = await desktopFixture();
  try {
    const { build } = await import('vite');
    const root = join(__dirname, '..');
    const built = await build({ configFile: false, root, logLevel: 'silent',
      build: { lib: { entry: join(root, 'src/book/textures.js'), formats: ['es'] }, write: false, minify: false } });
    const outputs = Array.isArray(built) ? built : [built];
    const chunk = outputs.flatMap((output) => output.output).find((output) => output.type === 'chunk');
    const { page } = await launchProbe(fixture);
    await page.route('**/__folio-texture-test.js', (route) => route.fulfill({ contentType: 'text/javascript', body: chunk.code }));
    const image = `data:image/jpeg;base64,${(await posterBytes()).toString('base64')}`;
    const result = await page.evaluate(async (image) => {
      const { createPageTexture } = await import('/__folio-texture-test.js');
      const labels = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { labels.push(text); return fillText.call(this, text, ...args); };
      const page = { rects: [{ i: 0, x: 0, y: 0, w: 60, h: 40 }, { i: 1, x: 80, y: 0, w: 60, h: 40 }] };
      let loaded;
      const ready = new Promise((resolve) => { loaded = resolve; });
      let paints = 0;
      const texture = createPageTexture(0, page, () => image, () => { if (++paints === 2) loaded(); },
        (i) => i === 1 ? { kind: 'video', duration: 2 } : null);
      await ready;
      const canvas = texture.image;
      const context = canvas.getContext('2d');
      const pixel = (mmX, mmY) => [...context.getImageData(Math.round(mmX * canvas.width / 209.8), Math.round(mmY * canvas.height / 192.4), 1, 1).data];
      const photoPixel = pixel(57, 31.4);
      const videoPixel = pixel(137, 31.4);
      texture.dispose();
      CanvasRenderingContext2D.prototype.fillText = fillText;
      const NativeImage = window.Image;
      const images = [];
      window.Image = function () { const image = new NativeImage(); images.push(image); return image; };
      let disposedPaints = 0;
      const disposed = createPageTexture(0, page, () => image, () => disposedPaints++, () => ({ kind: 'video', duration: 2 }));
      disposed.dispose();
      await Promise.all(images.map((image) => image.decode().catch(() => {})));
      await new Promise(requestAnimationFrame);
      window.Image = NativeImage;
      return { labels, photoPixel, videoPixel, disposedPaints };
    }, image);
    expect(result.labels).toEqual(['0:02']);
    expect(result.photoPixel[0]).toBeLessThan(80);
    expect(result.videoPixel[0]).toBeGreaterThan(180);
    expect(result.disposedPaints).toBe(0);
  } finally { await fixture.close(); }
});

for (const frameWorkMs of [0, 250, 1000]) {
  test(`actual 3D book loads only posters and a real hit on the back-page video opens native playback (${frameWorkMs}ms frame work)`, async () => {
    const fixture = await desktopFixture();
    try {
      const album = await seedMixed(fixture);
      const { page, origin } = await openAlbum(fixture, album);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('.tile-video img').evaluate((image) => image.decode());
      const originals = [];
      page.on('request', (request) => { if (/\/media\/[^/]+\/p\d+\/original$/.test(request.url())) originals.push(request.url()); });
      const frames = await page.evaluateHandle((frameWorkMs) => {
        const request = window.requestAnimationFrame.bind(window);
        const cancel = window.cancelAnimationFrame.bind(window);
        const pending = new Set();
        let completed = 0;
        let first;
        let last;
        let maxGap = 0;
        window.requestAnimationFrame = (callback) => {
          const id = request((time) => {
            pending.delete(id);
            try { callback.call(window, time); }
            finally {
              // Model synchronous rendering cost while retaining native frame timestamps.
              const end = performance.now() + frameWorkMs;
              while (performance.now() < end) {}
              completed++;
              first ??= time;
              if (last !== undefined) maxGap = Math.max(maxGap, time - last);
              last = time;
            }
          });
          pending.add(id);
          return id;
        };
        window.cancelAnimationFrame = (id) => {
          pending.delete(id);
          cancel(id);
        };
        return {
          get pending() { return pending.size; },
          stats: () => ({ pending: pending.size, completed, frameSpan: last - first, maxGap, visibility: document.visibilityState }),
        };
      }, frameWorkMs);
      await page.goto(`${origin}/#/a/${album.id}/3d`);
      const canvas = page.locator('.ab canvas');
      await expect(canvas).toBeVisible();
      await expect(page.locator('.ab')).not.toHaveAttribute('data-error', '');
      const next = page.locator('.ab [data-act=next]');
      if (frameWorkMs) await next.dispatchEvent('click');
      else await next.click();
      await expect(page.locator('.ab-count')).toHaveText('2 / 2');
      // Slow-frame animation shares the existing scenario deadline, not the assertion's 5s default.
      try { await expect.poll(() => frames.evaluate((state) => state.pending), { timeout: test.info().timeout }).toBe(0); }
      finally {
        console.log('Owned book animation:', JSON.stringify(await frames.evaluate((state) => state.stats()).catch(() => null)));
      }
      const animation = await frames.evaluate((state) => state.stats());
      expect(animation.frameSpan, 'page turning must catch up with elapsed time on slow frames').toBeLessThan(2000 + 3 * animation.maxGap);
      expect(originals).toEqual([]);
      await page.screenshot({ path: test.info().outputPath('video-book-actual.png'), fullPage: true, scale: 'css' });
      const point = await restVideoPoint(page, album);
      await page.mouse.click(point.x, point.y);
      await expect(page).toHaveURL(new RegExp(`/3d/p/p002$`));
      await expect(page.locator('.lb-video')).toBeVisible();
      expect(originals.length).toBeGreaterThan(0);
    } finally { await fixture.close(); }
  });
}
