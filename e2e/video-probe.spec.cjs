const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { desktopFixture } = require('./fixtures.cjs');
const { launchProbe } = require('./video-fixtures.cjs');
const { nativeVideo } = require('../tests/fixtures/video.cjs');

async function observeResources(page) {
  await page.evaluate(() => {
    window.probeResources = { created: 0, revoked: 0, videos: [], decoded: 0 };
    const create = document.createElement.bind(document);
    document.createElement = (tag, ...args) => {
      const element = create(tag, ...args);
      if (tag === 'video') {
        window.probeResources.videos.push(element);
        const pause = element.pause.bind(element);
        element.pause = () => {
          window.probeResources.decoded = Math.max(window.probeResources.decoded, element.getVideoPlaybackQuality().totalVideoFrames);
          return pause();
        };
      }
      return element;
    };
    const createURL = URL.createObjectURL.bind(URL);
    const revokeURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.probeResources.created++; return createURL(blob); };
    URL.revokeObjectURL = (url) => { window.probeResources.revoked++; return revokeURL(url); };
  });
}
async function assertReleased(page) {
  const result = await page.evaluate(() => ({
    created: window.probeResources.created, revoked: window.probeResources.revoked,
    released: window.probeResources.videos.every((video) => !video.isConnected && video.paused && !video.hasAttribute('src')),
  }));
  expect(result.revoked).toBe(result.created);
  expect(result.released).toBe(true);
}
async function probe(page, bytes, name, type) {
  return page.evaluate(async ({ encoded, name, type }) => {
    const { probeVideo } = await import('/src/video-probe.js');
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    try {
      const value = await probeVideo(new File([bytes], name, { type }));
      const image = await createImageBitmap(value.poster);
      const result = { ok: true, w: value.w, h: value.h, duration: value.duration,
        pw: image.width, ph: image.height, type: value.poster.type, size: value.poster.size };
      image.close();
      return result;
    } catch (error) { return { ok: false, code: error.code, name: error.name }; }
  }, { encoded: bytes.toString('base64'), name, type });
}

test('native probe decodes supported containers, rotation, subsecond clips and bounded large posters with empty or incorrect MIME', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await launchProbe(fixture);
    await observeResources(page);
    const cases = [
      ['h264-aac.mp4', 'CLIP.MP4', '', 320, 180, 320, 180],
      ['h264-aac.mov', 'clip.MOV', 'video/quicktime', 320, 180, 320, 180],
      ['h264-aac.m4v', 'clip.m4v', 'video/x-m4v', 320, 180, 320, 180],
      ['h264-rotated.mp4', 'portrait.mp4', 'image/jpeg', 180, 320, 180, 320],
      ['h264-tiny.mp4', 'tiny.mp4', 'video/mp4', 160, 90, 160, 90],
      ['h264-large.mp4', 'large.mp4', 'video/mp4', 1920, 1080, 1600, 900],
    ];
    for (const [source, name, type, w, h, pw, ph] of cases) {
      const result = await probe(page, await nativeVideo(source), name, type);
      expect(result, source).toMatchObject({ ok: true, w, h, pw, ph, type: 'image/jpeg' });
      expect(result.duration).toBeGreaterThan(0);
      if (source.includes('tiny')) expect(result.duration).toBeLessThan(0.1);
      expect(result.size).toBeGreaterThan(500);
      await assertReleased(page);
    }
    expect(await page.evaluate(() => window.probeResources.decoded)).toBeGreaterThan(0);
  } finally { await fixture.close(); }
});

test('bad native video and HEIC are rejected without poisoning the next probe or leaking resources', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await launchProbe(fixture);
    await observeResources(page);
    for (const bytes of [Buffer.from('not a video'), await readFile(require.resolve('../tests/fixtures/photos/multi.heic'))]) {
      expect(await probe(page, bytes, 'fake.mp4', 'video/mp4')).toMatchObject({ ok: false, code: 'unsupported' });
      await assertReleased(page);
    }
    expect(await probe(page, await nativeVideo(), 'valid.mp4', 'video/mp4')).toMatchObject({ ok: true, w: 320, h: 180 });
    const early = await page.evaluate(async () => {
      const { probeVideo } = await import('/src/video-probe.js');
      const controller = new AbortController();
      controller.abort();
      const file = new File(['x'], 'large.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 1_000_000_001 });
      const result = [];
      try { await probeVideo(file); } catch (error) { result.push(error.code); }
      try { await probeVideo(new File(['x'], 'cancel.mp4'), { signal: controller.signal }); } catch (error) { result.push(error.name); }
      return result;
    });
    expect(early).toEqual(['too-large', 'AbortError']);
    await assertReleased(page);
  } finally { await fixture.close(); }
});

test('probe timeout, blocked preparation and cancellation settle and ignore late play promises', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await launchProbe(fixture);
    await observeResources(page);
    await page.clock.install();
    await page.evaluate(() => {
      const create = document.createElement.bind(document);
      window.fakeProbeMode = 'timeout';
      window.fakeProbeCalls = 0;
      document.createElement = (tag, ...args) => {
        const element = create(tag, ...args);
        if (tag === 'video') {
          Object.defineProperty(element, 'src', { configurable: true, get: () => '', set: () => {} });
          element.load = () => {};
          element.play = () => {
            window.fakeProbeCalls++;
            return window.fakeProbeMode === 'blocked'
              ? Promise.reject(new DOMException('Owned policy block', 'NotAllowedError'))
              : new Promise((resolve) => { window.releaseProbePlay = resolve; });
          };
        }
        return element;
      };
    });
    for (const mode of ['timeout', 'blocked', 'abort']) {
      await page.evaluate(async (mode) => {
        const { probeVideo } = await import('/src/video-probe.js');
        window.fakeProbeMode = mode;
        window.abortProbe = new AbortController();
        window.probePending = probeVideo(new File(['x'], 'clip.mp4', { type: 'video/mp4' }), { signal: window.abortProbe.signal })
          .then(() => ({ ok: true }), (error) => ({ code: error.code, name: error.name }));
      }, mode);
      if (mode === 'abort') await page.evaluate(() => window.abortProbe.abort());
      else await page.clock.fastForward(15001);
      const result = await page.evaluate(() => window.probePending);
      expect(mode === 'abort' ? result.name : result.code).toBe(mode === 'abort' ? 'AbortError' : mode);
      const calls = await page.evaluate(() => window.fakeProbeCalls);
      await page.evaluate(async () => { window.releaseProbePlay?.(); await Promise.resolve(); });
      expect(await page.evaluate(() => window.fakeProbeCalls)).toBe(calls);
      await assertReleased(page);
    }
  } finally { await fixture.close(); }
});

test('play policy denial can still use a preloaded native frame and failed canvas encoding is readable', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await launchProbe(fixture);
    await observeResources(page);
    await page.evaluate(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Owned policy denial', 'NotAllowedError'));
    });
    expect(await probe(page, await nativeVideo(), 'preloaded.mp4', 'video/mp4')).toMatchObject({ ok: true, w: 320, h: 180 });
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = (callback) => queueMicrotask(() => callback(null));
    });
    expect(await probe(page, await nativeVideo(), 'bad-poster.mp4', 'video/mp4')).toMatchObject({ ok: false, code: 'unreadable' });
    await assertReleased(page);
  } finally { await fixture.close(); }
});
