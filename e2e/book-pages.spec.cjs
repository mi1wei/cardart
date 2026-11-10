const { test, expect } = require('@playwright/test');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook } = require('./ui-helpers.cjs');
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

test('phone controls overlay a centered full-canvas view while desktop framing stays inset', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  let observedPage;
  try {
    const { page } = await fixture.launch();
    observedPage = page;
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Full-canvas overlays', 3, 1);
    await page.evaluate(() => {
      const prototype = WebGL2RenderingContext.prototype;
      const getLocation = prototype.getUniformLocation;
      const setMatrix = prototype.uniformMatrix4fv;
      const names = new WeakMap();
      window.fullCanvasProjection = [];
      prototype.getUniformLocation = function (program, name) {
        const location = getLocation.call(this, program, name);
        if (location) names.set(location, name);
        return location;
      };
      prototype.uniformMatrix4fv = function (location, transpose, values, ...rest) {
        if (names.get(location) === 'projectionMatrix') window.fullCanvasProjection = Array.from(values);
        return setMatrix.call(this, location, transpose, values, ...rest);
      };
      window.restoreFullCanvasProjection = () => {
        prototype.getUniformLocation = getLocation;
        prototype.uniformMatrix4fv = setMatrix;
      };
    });
    await page.evaluate((hash) => { location.hash = hash; }, `#/a/${album.id}/3d`);
    await expect(page.locator('.ab-count')).toBeVisible({ timeout: 15000 });
    for (const { phone, ...viewport } of [
      { width: 390, height: 844, phone: true },
      { width: 844, height: 390, phone: true },
      { width: 1280, height: 860, phone: false },
      { width: 390, height: 844, phone: true },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect.poll(() => page.evaluate(() => window.fullCanvasProjection.length)).toBe(16);
      const bar = await page.locator('.ab-bar').boundingBox();
      const foot = await page.locator('.ab-foot').boundingBox();
      const center = phone ? 0 : (bar.height - foot.height) / viewport.height;
      await expect.poll(async () => {
        const projection = await page.evaluate(() => window.fullCanvasProjection);
        return Math.abs(projection[8]) + Math.abs(projection[9] - center);
      }, { message: `camera framing at ${viewport.width}x${viewport.height}` }).toBeLessThan(.00001);
      const bounds = await page.locator('.ab canvas').boundingBox();
      expect(bounds).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      for (const control of ['.ab-bar', '.ab-foot']) {
        await expect(page.locator(control)).toHaveCSS('position', 'absolute');
      }
      const fullscreen = page.locator('.ab-bar [data-act=fullscreen]');
      if (phone) await expect(fullscreen).toBeHidden();
      else await expect(fullscreen).toBeVisible();
      if (phone && viewport.width > viewport.height) {
        const screenshot = test.info().outputPath('landscape-overlay.png');
        await page.screenshot({ path: screenshot });
        await test.info().attach('landscape-overlay', { path: screenshot, contentType: 'image/png' });
      }
    }
  } finally {
    await observedPage?.evaluate(() => window.restoreFullCanvasProjection?.()).catch(() => {});
    await fixture.close();
  }
});

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
      ctx.fillText = (text, ...rest) => { labels.push({ text, width: ctx.measureText(text).width, font: ctx.font }); return fillText(text, ...rest); };
      drawTitlePage(ctx, { title: 'A very long album name '.repeat(8).trim(), dates: '', count: '2 photos' }, 150, 150);
      return { plain, labels };
    });
    expect(result.plain.dates).toBe('');
    expect(result.plain.count).toMatch(/1 (photo|张照片) · 1 (video|个视频|段视频)/);
    expect(result.labels).toHaveLength(2);
    expect(result.labels[0].text.endsWith('…')).toBe(true);
    expect(result.labels[0].width).toBeLessThanOrEqual(150 - 24);
    expect(result.labels[1].text).toBe('2 photos');
    expect(result.labels[1].font).toMatch(/^5\.2px /);
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
      const fonts = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { labels.push(text); fonts.push(this.font); return fillText.call(this, text, ...args); };
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
        fonts,
        captionGap: pixel(27 + 30, 11.4 + 33.6),
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
    // Upright and about 12 px on screen at 1180 × 800 (polish spec §4.2).
    expect(result.fonts).toHaveLength(2);
    for (const font of result.fonts) expect(font).toMatch(/^5px /);
    expect(result.captionGap[0]).toBeGreaterThan(180); // the photo leaves 7.4 mm for the caption: film shows
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

test('tall portrait textures preserve photograph proportions and a readable note', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const { layoutPortraitPage } = await import('../src/book/layout.js');
    const layout = layoutPortraitPage({ rects: [{ i: 0, x: 0, y: 0, w: 60, h: 120 }] }, 280);
    const image = `data:image/jpeg;base64,${(await sharp({ create: { width: 120, height: 240, channels: 3, background: '#2b6187' } }).jpeg().toBuffer()).toString('base64')}`;
    await serveModule(page, 'src/book/textures.js', '/__folio-tall-texture.js');
    const result = await page.evaluate(async ({ layout, image }) => {
      const { createPageTexture } = await import('/__folio-tall-texture.js');
      const draws = [];
      const notes = [];
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        draws.push(args);
        return drawImage.call(this, image, ...args);
      };
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        notes.push(text);
        return fillText.call(this, text, ...args);
      };
      let ready;
      const loaded = new Promise((resolve) => { ready = resolve; });
      let texture;
      try {
        texture = createPageTexture(0, layout, () => image, ready, () => ({ note: 'Still proportional' }), 280);
        await loaded;
        return { draws, notes, width: texture.image.width, height: texture.image.height };
      } finally {
        texture?.dispose();
        CanvasRenderingContext2D.prototype.drawImage = drawImage;
        CanvasRenderingContext2D.prototype.fillText = fillText;
      }
    }, { layout, image });
    expect(result.draws).toHaveLength(1);
    const [x, y, width, height] = result.draws[0];
    expect(width / height).toBeCloseTo(.5, 5);
    expect(x).toBeGreaterThan(22);
    expect(y + height).toBeLessThan(280);
    expect(result.height).toBeGreaterThan(result.width);
    expect(result.notes).toEqual(['Still proportional']);
  } finally { await fixture.close(); }
});

test('the cover title is opaque dark ink with a light edge, legible against the cover', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/binder.js', '/__folio-binder-test.js');
    const result = await page.evaluate(async () => {
      const { createBinder } = await import('/__folio-binder-test.js');
      const { group } = createBinder({ sheets: 2, title: 'Summer by the sea' });
      const label = group.getObjectByName('cover-title');
      const canvas = label.material.map.image;
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const board = label.parent.material.color.getHexString();
      const base = [0, 2, 4].map((i) => parseInt(board.slice(i, i + 2), 16));
      const linear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
      // What the eye sees: each title pixel laid over the board at the label's opacity.
      let ink = luminance(base);
      let light = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = (data[i + 3] / 255) * label.material.opacity;
        if (alpha < 0.3) continue;
        const seen = luminance([0, 1, 2].map((k) => data[i + k] * alpha + base[k] * (1 - alpha)));
        ink = Math.min(ink, seen);
        if (seen > luminance(base)) light++;
      }
      return { opacity: label.material.opacity, contrast: (luminance(base) + 0.05) / (ink + 0.05), light };
    });
    expect(result.opacity).toBe(1);
    expect(result.contrast, 'title against the cover (WCAG AA: 4.5)').toBeGreaterThanOrEqual(4.5);
    expect(result.light, 'a light edge under the letters').toBeGreaterThan(0);
  } finally { await fixture.close(); }
});

test('the title page reads in both themes: the see-through cover follows the page, the plain board stays light', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    // Each bundle has its own GPU check, so one can be a graphics card and the other a CPU renderer.
    await serveModule(page, 'src/book/binder.js', '/__folio-title-ink-gpu.js');
    await serveModule(page, 'src/book/binder.js', '/__folio-title-ink-lite.js');
    const result = await page.evaluate(async () => {
      const linear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const luminance = (css) => {
        const [r, g, b] = css.startsWith('#') ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16)) : css.match(/[\d.]+/g).map(Number);
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      };
      const contrast = (a, b) => {
        const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (high + 0.05) / (low + 0.05);
      };
      const fills = [];
      let renderer = '';
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      const getParameter = WebGL2RenderingContext.prototype.getParameter;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        fills.push({ canvas: this.canvas, ink: this.fillStyle });
        return fillText.call(this, text, ...args);
      };
      WebGL2RenderingContext.prototype.getParameter = function (parameter) {
        return parameter === 0x9246 ? renderer : getParameter.call(this, parameter);
      };
      const theme = (mode) => {
        document.documentElement.dataset.theme = mode;
        document.dispatchEvent(new Event('folio-theme'));
      };
      const titlePage = { title: 'Summer by the sea', dates: 'Jul 12 – 15, 2026', count: '8 photos' };
      const inks = (binder) => {
        const canvas = binder.group.getObjectByName('title-page').material.map.image;
        return fills.filter((fill) => fill.canvas === canvas).map((fill) => fill.ink);
      };
      // Title, dates and count from the latest drawing, each against what shows behind them.
      const ratios = (binder, behind) => inks(binder).slice(-3).map((ink) => contrast(ink, behind));
      const pageColour = () => getComputedStyle(document.body).backgroundColor;
      try {
        theme('dark');
        renderer = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)';
        const gpu = (await import('/__folio-title-ink-gpu.js')).createBinder({ sheets: 2, title: 'Summer', titlePage });
        const map = gpu.group.getObjectByName('title-page').material.map;
        const darkPage = ratios(gpu, pageColour());
        const version = map.version;
        theme('light');
        const lightPage = ratios(gpu, pageColour());
        const redrawn = map.version > version;
        gpu.dispose();
        const drawn = inks(gpu).length;
        theme('dark');
        const afterDispose = inks(gpu).length - drawn;
        renderer = 'ANGLE (Google, Vulkan SwiftShader Device (Subzero))';
        const lite = (await import('/__folio-title-ink-lite.js')).createBinder({ sheets: 2, title: 'Summer', titlePage });
        const board = `#${lite.group.getObjectByName('title-page').parent.material.color.getHexString()}`;
        const plain = ratios(lite, board);
        lite.dispose();
        return { darkPage, lightPage, redrawn, afterDispose, plain };
      } finally {
        CanvasRenderingContext2D.prototype.fillText = fillText;
        WebGL2RenderingContext.prototype.getParameter = getParameter;
        delete document.documentElement.dataset.theme;
      }
    });
    for (const [name, list] of Object.entries({ darkPage: result.darkPage, lightPage: result.lightPage, plain: result.plain })) {
      expect(list, name).toHaveLength(3);
      for (const ratio of list) expect(ratio, `${name} (WCAG AA: 4.5)`).toBeGreaterThanOrEqual(4.5);
    }
    // A CPU renderer softens thin strokes: drawn at 5.3:1 the small print measured 4.2–4.4:1.
    for (const ratio of result.plain.slice(1)) expect(ratio, 'plain board small print, with room for a CPU renderer').toBeGreaterThanOrEqual(6);
    expect(result.redrawn, 'a theme change repaints the title page').toBe(true);
    expect(result.afterDispose, 'a closed book stops following the theme').toBe(0);
  } finally { await fixture.close(); }
});

test('a book that cannot get WebGL stops following the theme', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/book.js', '/__folio-book-no-webgl.js');
    const result = await page.evaluate(async () => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      const { addEventListener: add, removeEventListener: remove } = document;
      const listening = new Set();
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /webgl/i.test(type) ? null : getContext.call(this, type, ...args);
      };
      document.addEventListener = function (type, listener, ...args) {
        if (type === 'folio-theme') listening.add(listener);
        return add.call(this, type, listener, ...args);
      };
      document.removeEventListener = function (type, listener, ...args) {
        if (type === 'folio-theme') listening.delete(listener);
        return remove.call(this, type, listener, ...args);
      };
      const container = document.createElement('div');
      document.body.append(container);
      try {
        const { createBook } = await import('/__folio-book-no-webgl.js');
        createBook(container, {
          title: 'Summer', titlePage: { title: 'Summer', dates: '', count: '1 photo' }, pages: [{ rects: [] }],
          photoUrl: () => '', insets: { top: 0, bottom: 0 }, onChange() {}, onPhotoClick() {},
        });
        return { error: null, listening: listening.size };
      } catch (error) {
        return { error: error.message, listening: listening.size };
      } finally {
        HTMLCanvasElement.prototype.getContext = getContext;
        delete document.addEventListener;
        delete document.removeEventListener;
        container.remove();
      }
    });
    expect(result).toEqual({ error: 'webgl', listening: 0 });
  } finally { await fixture.close(); }
});
