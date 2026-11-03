const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { launchProbe, openAlbum, seedMixed } = require('./video-fixtures.cjs');
const { nativeVideo } = require('../tests/fixtures/video.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');

async function emptyAlbum(fixture) {
  const { openLibrary } = await import('../server/library.js');
  const lib = await openLibrary(fixture.library);
  try { return await lib.create('Owned mixed import'); }
  finally { await lib.close(); }
}
const videoUpload = /\/api\/albums\/[^/]+\/photos\?.*kind=video/;
async function observeUpload(page) {
  await page.evaluate(() => {
    window.observedUpload = [];
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      for (const event of ['loadstart', 'progress', 'load', 'loadend']) this.upload.addEventListener(event, (value) => {
        window.observedUpload.push({ event, loaded: value.loaded, total: value.total, label: document.querySelector('.upload b')?.textContent });
      });
      return send.call(this, body);
    };
  });
}

test('real mixed uploads preserve MOV bytes, reject fake video locally and render bilingual category counts without narrow overflow', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await emptyAlbum(fixture);
    const { page, origin } = await openAlbum(fixture, album);
    await observeUpload(page);
    const posts = [];
    page.on('request', (request) => { if (request.method() === 'POST' && /\/photos\?/.test(request.url())) posts.push(request.url()); });
    const movie = await nativeVideo('h264-aac.mov');
    await page.locator('.album-page input[type=file]').setInputFiles([
      { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await photoBytes({ exif: null }) },
      { name: `CLIP-${'long-'.repeat(35)}.MOV`, mimeType: '', buffer: movie },
      { name: 'fake.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') },
    ]);
    await expect(page.locator('.tile')).toHaveCount(2);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await expect(page.locator('.album-page .count')).toHaveText('1 photo · 1 video');
    await expect(page.locator('.tile-video .video-badge')).toContainText('0:02');
    await expect(page.locator('.upload small')).toContainText('Imported 2 items');
    await expect(page.locator('.upload small')).toContainText('1 unsupported');
    expect(posts).toHaveLength(2);
    expect(await page.evaluate(() => window.observedUpload.some((event) => event.event === 'load' && event.label.includes('Saving')))).toBe(true);
    const saved = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    const video = saved.photos.find((item) => item.kind === 'video');
    expect(video.file).toMatch(/\.mov$/);
    expect(await (await page.request.get(`${origin}/media/${album.id}/${video.id}/original`)).body()).toEqual(movie);
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator('.nav [data-lang=zh]').click();
    await expect(page.locator('.album-page .count')).toHaveText('1 张照片 · 1 个视频');
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.page > .ph .sub')).toContainText('1 张照片 · 1 个视频');
    await expect(page.locator('.folders .video-badge')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('response-held imports keep navigation guarded and duplicate videos add no second tile', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let responseHeld = false;
  try {
    const album = await emptyAlbum(fixture);
    const { page, origin } = await openAlbum(fixture, album);
    await observeUpload(page);
    await page.route(videoUpload, async (route) => {
      const response = await route.fetch();
      responseHeld = true;
      await held;
      await route.fulfill({ response });
    });
    const clip = { name: 'clip.mp4', mimeType: 'video/mp4', buffer: await nativeVideo() };
    await page.locator('.album-page input[type=file]').setInputFiles(clip);
    await expect.poll(() => responseHeld).toBe(true);
    // Interception stalls native upload events; the un-intercepted test checks load -> Saving.
    await expect(page.locator('.upload')).toContainText('Uploading');
    await expect(page.locator('.tile')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-busy', '');
    await page.locator('.nav [data-lang=zh]').dispatchEvent('click');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.evaluate(() => { location.hash = '#/albums'; });
    await expect(page).toHaveURL(new RegExp(`/a/${album.id}$`));
    release();
    await expect(page.locator('.tile-video')).toHaveCount(1);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await expect(page.locator('.album-page .count')).toHaveText('1 video');
    await page.locator('.album-page input[type=file]').setInputFiles(clip);
    await expect(page.locator('.upload small')).toContainText('1 duplicate');
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await expect(page.locator('.tile')).toHaveCount(1);
    expect((await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).photos).toHaveLength(1);
  } finally { release(); await fixture.close(); }
});

test('network upload failures do not strand busy state or the following photo', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await emptyAlbum(fixture);
    const { page } = await openAlbum(fixture, album);
    await page.route(videoUpload, (route) => route.abort('failed'));
    await page.locator('.album-page input[type=file]').setInputFiles([
      { name: 'network.mp4', mimeType: 'video/mp4', buffer: await nativeVideo() },
      { name: 'next.jpg', mimeType: 'image/jpeg', buffer: await photoBytes({ exif: null }) },
    ]);
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.tile-video')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await expect(page.locator('.upload small')).toContainText('1 failed');
    await expect(page.locator('.upload small')).toContainText('Imported 1 item');
  } finally { await fixture.close(); }
});

test('a preparation timeout stays distinct from unsupported and the photo queue continues', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await emptyAlbum(fixture);
    const { page } = await openAlbum(fixture, album);
    await page.clock.install();
    await page.evaluate(() => {
      const create = document.createElement.bind(document);
      document.createElement = (tag, ...args) => {
        const element = create(tag, ...args);
        if (tag === 'video') {
          Object.defineProperty(element, 'src', { get: () => '', set: () => {} });
          element.load = () => {};
          element.play = () => new Promise(() => {});
        }
        return element;
      };
    });
    await page.locator('.album-page input[type=file]').setInputFiles([
      { name: 'slow.mp4', mimeType: 'video/mp4', buffer: await nativeVideo() },
      { name: 'next.jpg', mimeType: 'image/jpeg', buffer: await photoBytes({ exif: null }) },
    ]);
    await expect(page.locator('.upload')).toContainText('Preparing video');
    await page.clock.fastForward(15001);
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await expect(page.locator('.upload small')).toContainText('timed out');
    await expect(page.locator('.upload small')).not.toContainText('unsupported');
  } finally { await fixture.close(); }
});

test('read-only mixed albums retain correct counts but cannot start new uploads', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const album = await seedMixed(fixture);
    const { page } = await openAlbum(fixture, album);
    await expect(page.locator('.tile')).toHaveCount(2);
    await expect(page.locator('.tile-video')).toHaveCount(1);
    await expect(page.locator('.album-page .count')).toHaveText('1 photo · 1 video');
    await expect(page.locator('.album-page [data-act=upload]').first()).toHaveAttribute('aria-disabled', 'true');
  } finally { await fixture.close(); }
});

test('XHR composes poster and source bytes, exposes saving without early success, rejects invalid replies and aborts cleanly', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await launchProbe(fixture);
    const result = await page.evaluate(async () => {
      const { api } = await import('/src/api.js');
      const { formatDuration } = await import('/shared/media.js');
      class Events extends EventTarget {
        dispatchEvent(event) { const result = super.dispatchEvent(event); this[`on${event.type}`]?.(event); return result; }
      }
      class XHR extends Events {
        constructor() { super(); this.upload = new Events(); this.headers = {}; window.lastVideoXHR = this; }
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader(key, value) { this.headers[key] = value; }
        send(body) { this.body = body; }
        abort() { this.dispatchEvent(new Event('abort')); }
      }
      window.XMLHttpRequest = XHR;
      const file = new File([new Uint8Array([4, 5, 6])], 'CLIP name.MOV', { lastModified: 1577934245000 });
      const probe = { poster: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), w: 1920, h: 1080, duration: 0.04 };
      const stages = [];
      let settled = false;
      const pending = api.uploadVideo('owned-album', file, probe, (value) => stages.push(value.stage)).then((value) => { settled = true; return value; });
      const xhr = window.lastVideoXHR;
      const body = [...new Uint8Array(await xhr.body.arrayBuffer())];
      xhr.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: 6, total: 6 }));
      xhr.upload.dispatchEvent(new Event('load'));
      await Promise.resolve();
      const before = settled;
      const query = Object.fromEntries(new URL(xhr.url, location.origin).searchParams);
      xhr.status = 200;
      xhr.responseText = '{"skipped":"duplicate"}';
      xhr.dispatchEvent(new Event('load'));
      const saved = await pending;
      const count = stages.length;
      xhr.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: 6, total: 6 }));
      const errors = [];
      for (const [status, responseText] of [[200, 'not-json'], [200, '{}'], [403, '{"error":"Owned refusal"}']]) {
        const next = api.uploadVideo('owned-album', file, probe);
        const xhr = window.lastVideoXHR;
        xhr.status = status;
        xhr.responseText = responseText;
        xhr.dispatchEvent(new Event('load'));
        try { await next; errors.push('resolved'); } catch (error) { errors.push(error.status || error.name); }
      }
      const controller = new AbortController();
      const next = api.uploadVideo('owned-album', file, probe, undefined, { signal: controller.signal });
      controller.abort();
      let abort;
      try { await next; } catch (error) { abort = error.name; }
      return { body, before, saved, stages, stopped: stages.length === count, query, errors, abort,
        durations: [0.04, 61.99, 3601.1].map(formatDuration) };
    });
    expect(result.body).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.before).toBe(false);
    expect(result.stages).toContain('saving');
    expect(result.saved).toEqual({ skipped: 'duplicate' });
    expect(result.stopped).toBe(true);
    expect(result.query).toMatchObject({ kind: 'video', name: 'CLIP name.MOV', posterBytes: '3', w: '1920', h: '1080', duration: '0.04', lastModified: '1577934245000' });
    expect(result.errors).not.toContain('resolved');
    expect(result.errors[2]).toBe(403);
    expect(result.abort).toBe('AbortError');
    expect(result.durations).toEqual(['0:00', '1:01', '1:00:01']);
  } finally { await fixture.close(); }
});
