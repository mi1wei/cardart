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

test('software WebGL keeps scene buffers bounded while retaining shadows and reflections', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await page.emulateMedia({ colorScheme: 'light' });
    await serveModule(page, 'src/book/scene.js', '/__folio-software-scene.js');
    const result = await page.evaluate(async () => {
      const { createStage } = await import('/__folio-software-scene.js');
      const nativeParameter = WebGL2RenderingContext.prototype.getParameter;
      const ratio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
      const container = document.createElement('div');
      container.style.cssText = 'width:640px;height:480px';
      document.body.append(container);
      let stage;
      try {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
        WebGL2RenderingContext.prototype.getParameter = function (parameter) {
          if (parameter === 0x9246) return 'ANGLE (Google, Vulkan SwiftShader Device (Subzero))';
          return nativeParameter.call(this, parameter);
        };
        stage = createStage(container, 220, { top: 0, bottom: 0 });
        stage.resize();
        stage.frame(0, 1);
        stage.render();
        const gl = stage.renderer.getContext();
        const pixel = new Uint8Array(4);
        gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const shadow = stage.scene.children.find((object) => object.isDirectionalLight).shadow;
        const environment = stage.scene.environment.image;
        return {
          antialias: gl.getContextAttributes().antialias,
          pixels: gl.drawingBufferWidth * gl.drawingBufferHeight,
          shadowPixels: shadow.mapSize.x * shadow.mapSize.y,
          environmentPixels: environment.width * environment.height,
          shadows: stage.renderer.shadowMap.enabled,
          background: [...pixel],
        };
      } finally {
        stage?.dispose();
        container.remove();
        WebGL2RenderingContext.prototype.getParameter = nativeParameter;
        if (ratio) Object.defineProperty(window, 'devicePixelRatio', ratio);
        else delete window.devicePixelRatio;
      }
    });
    expect(result.antialias).toBe(false);
    expect(result.pixels).toBeLessThanOrEqual(640 * 480);
    expect(result.shadowPixels).toBeLessThanOrEqual(640 * 480);
    expect(result.environmentPixels).toBeLessThanOrEqual(640 * 480);
    expect(result.shadows).toBe(true);
    for (const [i, channel] of [247, 249, 251].entries()) expect(Math.abs(result.background[i] - channel)).toBeLessThanOrEqual(3);
    expect(result.background[3]).toBe(255);
  } finally { await fixture.close(); }
});

// See-through boards render the scene twice and clear-coat doubles the shading: too slow on a CPU.
test('a software-rendered book compiles no see-through or clear-coat shaders, while a GPU keeps both', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    for (const kind of ['software', 'hardware']) await serveModule(page, 'src/book/book.js', `/__folio-book-${kind}.js`);
    const image = `data:image/jpeg;base64,${(await posterBytes()).toString('base64')}`;
    const result = await page.evaluate(async (image) => {
      const renderers = {
        software: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
        hardware: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)',
      };
      const nativeParameter = WebGL2RenderingContext.prototype.getParameter;
      const nativeSource = WebGL2RenderingContext.prototype.shaderSource;
      const out = {};
      for (const [kind, name] of Object.entries(renderers)) {
        const sources = [];
        WebGL2RenderingContext.prototype.getParameter = function (parameter) {
          return parameter === 0x9246 ? name : nativeParameter.call(this, parameter);
        };
        WebGL2RenderingContext.prototype.shaderSource = function (shader, source) {
          sources.push(source);
          return nativeSource.call(this, shader, source);
        };
        const container = document.createElement('div');
        container.style.cssText = 'width:640px;height:480px';
        document.body.append(container);
        let book;
        try {
          const { createBook } = await import(`/__folio-book-${kind}.js`);
          book = createBook(container, {
            title: 'Finish', pages: [{ rects: [{ i: 0, x: 0, y: 0, w: 60, h: 40 }] }], photoUrl: () => image,
            insets: { top: 0, bottom: 0 }, onChange() {}, onPhotoClick() {},
          });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          out[kind] = {
            shaders: sources.length,
            transmission: sources.some((source) => source.includes('#define USE_TRANSMISSION')),
            clearcoat: sources.some((source) => source.includes('#define USE_CLEARCOAT')),
          };
        } finally {
          book?.dispose();
          container.remove();
          WebGL2RenderingContext.prototype.getParameter = nativeParameter;
          WebGL2RenderingContext.prototype.shaderSource = nativeSource;
        }
      }
      return out;
    }, image);
    expect(result.hardware).toMatchObject({ transmission: true, clearcoat: true });
    expect(result.software.shaders).toBeGreaterThan(0);
    expect(result.software).toMatchObject({ transmission: false, clearcoat: false });
  } finally { await fixture.close(); }
});

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
    await page.evaluate(() => localStorage.setItem('lang', 'en'));
    await page.reload();
    await expect(page.locator('.ab')).toHaveAccessibleDescription('Jul 2 – 15, 2026 · 3 photos');
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

test('a photo with a note gets a one-line caption under it; blank notes change nothing', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/textures.js', '/__folio-caption-test.js');
    const image = `data:image/jpeg;base64,${(await posterBytes()).toString('base64')}`;
    const long = `Long note ${'that keeps going '.repeat(12)}\nsecond line`;
    const result = await page.evaluate(async ({ image, long }) => {
      const { createPageTexture } = await import('/__folio-caption-test.js');
      const labels = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { labels.push(text); return fillText.call(this, text, ...args); };
      const page = { rects: [{ i: 0, x: 0, y: 0, w: 60, h: 40 }, { i: 1, x: 80, y: 0, w: 60, h: 40 }, { i: 2, x: 0, y: 60, w: 60, h: 40 }] };
      const notes = ['Hi', long, ' \n '];
      let loaded;
      const ready = new Promise((resolve) => { loaded = resolve; });
      let paints = 0;
      const texture = createPageTexture(0, page, () => image, () => { if (++paints === 3) loaded(); }, (i) => ({ kind: 'photo', note: notes[i] }));
      await ready;
      CanvasRenderingContext2D.prototype.fillText = fillText;
      const canvas = texture.image;
      const context = canvas.getContext('2d');
      const pixel = (mmX, mmY) => [...context.getImageData(Math.round(mmX * canvas.width / 209.8), Math.round(mmY * canvas.height / 192.4), 1, 1).data];
      // Pocket origin on a front face: x 22 + 5, y 6.4 + 5 mm.
      const out = {
        labels,
        captionedCorner: pixel(27 + 1.5, 11.4 + 40 - 1),
        captionedTop: pixel(27 + 30, 11.4 + 10),
        blankCorner: pixel(27 + 1.5, 11.4 + 60 + 40 - 1),
      };
      texture.dispose();
      return out;
    }, { image, long });
    expect(result.labels).toContain('Hi');
    const cut = result.labels.find((text) => text.startsWith('Long note'));
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toContain('\n');
    expect(result.labels).toHaveLength(2);
    expect(result.captionedCorner[0]).toBeGreaterThan(180); // the photo moved up and in: film shows
    expect(result.captionedTop[0]).toBeLessThan(80); // the photo is still there
    expect(result.blankCorner[0]).toBeLessThan(80); // a blank note keeps the full photo
  } finally { await fixture.close(); }
});

test('a caption never collapses a panoramic photo shorter than the caption line', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const { layoutPages } = await import('../src/book/layout.js');
    const layout = layoutPages([6000 / 200], 1)[0];
    expect(layout.rects[0].h).toBeLessThan(6);
    await serveModule(page, 'src/book/textures.js', '/__folio-panorama-test.js');
    const jpeg = await sharp({ create: { width: 6000, height: 200, channels: 3, background: '#2b6187' } }).jpeg().toBuffer();
    const result = await page.evaluate(async ({ layout, image }) => {
      const { createPageTexture } = await import('/__folio-panorama-test.js');
      const draws = [];
      const captions = [];
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        draws.push(args);
        return drawImage.call(this, image, ...args);
      };
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        captions.push({ text, x: args[0], y: args[1] });
        return fillText.call(this, text, ...args);
      };
      let ready;
      const loaded = new Promise((resolve) => { ready = resolve; });
      let texture;
      try {
        texture = createPageTexture(0, layout, () => image, ready, () => ({ note: 'Panorama' }));
        await loaded;
        return { draws, captions };
      } finally {
        texture?.dispose();
        CanvasRenderingContext2D.prototype.drawImage = drawImage;
        CanvasRenderingContext2D.prototype.fillText = fillText;
      }
    }, { layout, image: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
    const [x, y, w, h] = result.draws[0];
    expect(x).toBeGreaterThan(0);
    expect(w).toBeGreaterThan(100);
    expect(h).toBeCloseTo(layout.rects[0].h);
    expect(result.captions.find((item) => item.text === 'Panorama').y).toBeGreaterThan(y + h);
  } finally { await fixture.close(); }
});
