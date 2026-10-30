const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');
const { seedMixed, openAlbum } = require('./video-fixtures.cjs');

async function playFrame(page) {
  const video = page.locator('.lb-video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(1);
  if (await video.evaluate((element) => element.paused)) {
    await video.focus();
    await page.keyboard.press('Space');
  }
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
  await video.evaluate((element) => new Promise((resolve) => element.requestVideoFrameCallback(resolve)));
  expect(await video.evaluate((element) => element.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
}

test('native video really decodes while keys and swipes stay with controls and switching releases the source', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seedMixed(fixture);
    const { page } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    await playFrame(page);
    await page.locator('.lb-video').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await page.locator('.lb-video').dispatchEvent('pointerdown', { clientX: 200, pointerId: 1 });
    await page.locator('.lb-video').dispatchEvent('pointerup', { clientX: 280, pointerId: 1 });
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await page.locator('.lb-video').evaluate((video) => { window.releasedVideo = video; });
    await page.locator('.lb-nav.l').click();
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    expect(await page.evaluate(() => ({ src: window.releasedVideo.getAttribute('src'), paused: window.releasedVideo.paused }))).toEqual({ src: null, paused: true });
    await page.locator('.lb-nav.r').click();
    await expect(page.locator('.lb-video')).toBeVisible();
    await page.locator('.lb-video').evaluate((video) => { window.releasedVideo = video; });
    await page.locator('.lb [data-act=close]').click();
    await expect(page.locator('.lb')).toHaveCount(0);
    expect(await page.evaluate(() => window.releasedVideo.paused && !window.releasedVideo.hasAttribute('src'))).toBe(true);
  } finally { await fixture.close(); }
});

test('video notes and cover updates preserve paused media identity/time and note persistence without changing original bytes', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seedMixed(fixture);
    const original = join(fixture.library, 'albums', album.id, 'originals', album.photos[1].file);
    const before = await readFile(original);
    let { page } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    await expect(page.locator('.lb-video')).toBeVisible();
    await expect.poll(() => page.locator('.lb-video').evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(1);
    await page.locator('.lb-video').evaluate(async (video) => {
      video.pause();
      const sought = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
      video.currentTime = 0.75;
      await sought;
      window.sameVideo = video;
    });
    await page.locator('[data-note-edit]').click();
    await expect(page.locator('.note-input')).toHaveAttribute('placeholder', /video/i);
    await page.getByLabel('Note text', { exact: true }).fill('Morning video\nSaved with the album.');
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.note-text')).toHaveText('Morning video\nSaved with the album.');
    await page.locator('.lb [data-act=cover]').click();
    await expect(page.locator('.lb [data-act=cover]')).toBeDisabled();
    expect(await page.locator('.lb-video').evaluate((video) => video === window.sameVideo)).toBe(true);
    expect(await page.locator('.lb-video').evaluate((video) => video.currentTime)).toBeCloseTo(0.75, 2);
    expect(await page.locator('.lb-video').evaluate((video) => video.paused)).toBe(true);
    expect(await readFile(original)).toEqual(before);
    await fixture.stop();
    ({ page } = await openAlbum(fixture, album, { suffix: '/p/p002' }));
    await expect(page.locator('.note-text')).toHaveText('Morning video\nSaved with the album.');
    await expect(page.locator('[data-field=duration]')).toHaveText('0:02');
    await expect(page.locator('[data-field=file-modified]')).toBeVisible();
    await expect(page.locator('[data-field=dimensions]')).toHaveText('320 × 180');
    await expect(page.locator('.lb-details')).not.toContainText('EXIF');
  } finally { await fixture.close(); }
});

test('injected unsupported, decode and read errors stay distinct and read failure can retry a new native element', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seedMixed(fixture);
    const { page } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    for (const [code, copy] of [[4, "can't be played on this device"], [3, 'could not be decoded'], [2, 'Could not read this video']]) {
      await expect(page.locator('.lb-video')).toBeVisible();
      await page.locator('.lb-video').evaluate((video, code) => {
        Object.defineProperty(video, 'error', { configurable: true, value: { code } });
        video.dispatchEvent(new Event('error'));
      }, code);
      await expect(page.locator('.lb-media-status')).toContainText(copy);
      if (code === 2) await page.locator('[data-act=video-retry]').click();
      else { await page.locator('.lb-nav.l').click(); await page.locator('.lb-nav.r').click(); }
    }
    await playFrame(page);
    await expect(page.locator('.lb-media-status')).toBeHidden();
  } finally { await fixture.close(); }
});

test('late video errors/play rejections cannot affect a new photo and autoplay policy denial remains a healthy paused player', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seedMixed(fixture);
    const { page } = await openAlbum(fixture, album);
    await page.evaluate(() => {
      HTMLMediaElement.prototype.play = () => new Promise((_, reject) => { window.rejectOldPlay = reject; });
    });
    await page.locator('.tile-video').click();
    await expect(page.locator('.lb-video')).toBeVisible();
    await page.locator('.lb-video').evaluate((video) => { window.oldVideo = video; });
    await page.locator('.lb-nav.l').click();
    await page.evaluate(() => {
      Object.defineProperty(window.oldVideo, 'error', { value: { code: 4 } });
      window.oldVideo.dispatchEvent(new Event('error'));
      window.rejectOldPlay(new DOMException('Owned late failure', 'NotSupportedError'));
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Owned autoplay policy', 'NotAllowedError'));
    });
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await expect(page.locator('.lb-media-status')).toBeHidden();
    await expect(page.locator('.lb-img')).toBeVisible();
    await page.locator('.lb-nav.r').click();
    await expect(page.locator('.lb-video')).toBeVisible();
    await expect(page.locator('.lb-media-status')).toBeHidden();
    expect(await page.locator('.lb-video').evaluate((video) => video.controls && video.paused)).toBe(true);
  } finally { await fixture.close(); }
});

test('a missing poster does not hide readable video and compact read-only Details remain correct in both languages', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const album = await seedMixed(fixture, { note: 'Visible video note' });
    const { page, origin } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    await page.route(`**/media/${album.id}/p002/1600`, (route) => route.fulfill({ status: 404, body: '' }));
    await page.reload();
    await playFrame(page);
    await expect(page.locator('.note-text')).toHaveText('Visible video note');
    await expect(page.locator('[data-note-edit]')).toBeHidden();
    await expect(page.locator('.lb [data-act=original]')).toHaveText('Original file');
    expect((await page.request.get(`${origin}/media/${album.id}/p002/original`)).ok()).toBe(true);
    await expect(page.locator('.lb-details')).not.toContainText('EXIF');
    for (const [width, height] of [[320, 740], [390, 844], [760, 600], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      expect(await page.locator('.lb').evaluate((root) => root.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.evaluate(() => localStorage.setItem('lang', 'zh'));
    await page.reload();
    await expect(page.locator('.lb [data-act=original]')).toHaveText('原文件');
    await expect(page.locator('[data-field=duration-label]')).toHaveText('时长');
    await expect(page.locator('[data-field=camera]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('video-player-readonly-zh.png'), fullPage: true, scale: 'css' });
  } finally { await fixture.close(); }
});

test('video native fullscreen consumes Escape before Details or lightbox navigation', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seedMixed(fixture);
    const { desktop, page } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    await desktop.evaluate(() => {
      global.ownedVideoFullscreen = false;
      global.ownedVideoExited = false;
      global.folioTestDesktop.window.once('enter-full-screen', () => { global.ownedVideoFullscreen = true; });
      global.folioTestDesktop.window.once('leave-full-screen', () => { global.ownedVideoExited = true; });
    });
    await expect(page.locator('.lb-video')).toBeVisible();
    await page.locator('.lb-video').evaluate((video) => {
      video.addEventListener('click', () => video.requestFullscreen(), { once: true });
    });
    await page.locator('.lb-video').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('VIDEO');
    await expect.poll(() => desktop.evaluate(() => global.ownedVideoFullscreen)).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect.poll(() => desktop.evaluate(() => global.ownedVideoExited)).toBe(true);
    await expect(page.locator('.lb')).toBeVisible();
    await expect(page.locator('.lb-desktop-details')).toHaveAttribute('aria-expanded', 'true');
  } finally { await fixture.close(); }
});

test('confirmed video deletion releases media before sending and holds navigation until the mutation completes', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered = false;
  try {
    const album = await seedMixed(fixture);
    const { page, origin } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    await expect(page.locator('.lb-video')).toBeVisible();
    await page.locator('.lb-video').evaluate((video) => { window.deletedVideo = video; });
    await page.route(`${origin}/api/albums/${album.id}/photos/delete`, async (route) => {
      const response = await route.fetch();
      entered = true;
      await held;
      await route.fulfill({ response });
    });
    await page.locator('.lb [data-act=delete]').click();
    await page.locator('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => entered).toBe(true);
    expect(await page.evaluate(() => window.deletedVideo.paused && !window.deletedVideo.hasAttribute('src'))).toBe(true);
    await page.locator('.lb-nav.l').click();
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await expect(page.locator('[data-note-edit]')).toBeDisabled();
    release();
    await expect(page.locator('.lb-count')).toHaveText('1 / 1');
    await expect(page.locator('.lb-video')).toHaveCount(0);
    const albumNow = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(albumNow.photos).toHaveLength(1);
  } finally { release(); await fixture.close(); }
});

for (const committed of [false, true]) test(`failed video deletion reconciles the server index (already committed: ${committed})`, async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seedMixed(fixture);
    const { page, origin } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    await expect(page.locator('.lb-video')).toBeVisible();
    await page.route(`${origin}/api/albums/${album.id}/photos/delete`, async (route) => {
      if (committed) await route.fetch();
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Owned response failure"}' });
    });
    await page.locator('.lb [data-act=delete]').click();
    await page.locator('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Owned response failure');
    await expect(page.locator('.lb-count')).toHaveText(committed ? '1 / 1' : '2 / 2');
    if (committed) await expect(page.locator('.lb-video')).toHaveCount(0);
    else {
      await expect(page.locator('.lb-video')).toBeVisible();
      await expect(page.locator('[data-note-edit]')).toBeEnabled();
      await playFrame(page);
    }
  } finally { await fixture.close(); }
});

test('an original-file 404 is a read failure rather than a claim about device codec support', async () => {
  const fixture = await desktopFixture();
  try {
    const album = await seedMixed(fixture);
    const { page } = await openAlbum(fixture, album);
    await page.route(`**/media/${album.id}/p002/original`, (route) => route.fulfill({ status: 404, body: '' }));
    await page.locator('.tile-video').click();
    await expect(page.locator('.lb-media-status')).toContainText('Could not read this video');
    await expect(page.locator('.lb-img')).toBeVisible();
    await expect(page.locator('[data-act=video-retry]')).toBeVisible();
  } finally { await fixture.close(); }
});

test('a pending source check is cancelled on switch and cannot paint a late video error over a photo', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let checking = false;
  let returned = false;
  try {
    const album = await seedMixed(fixture);
    const { page } = await openAlbum(fixture, album, { suffix: '/p/p002' });
    await expect(page.locator('.lb-video')).toBeVisible();
    await page.route(`**/media/${album.id}/p002/original`, async (route) => {
      if (route.request().method() !== 'HEAD') return route.continue();
      checking = true;
      await held;
      await route.fulfill({ status: 404, body: '' }).catch(() => {});
      returned = true;
    });
    await page.locator('.lb-video').evaluate((video) => {
      Object.defineProperty(video, 'error', { value: { code: 4 } });
      video.dispatchEvent(new Event('error'));
    });
    await expect.poll(() => checking).toBe(true);
    await page.locator('.lb-nav.l').click();
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    release();
    await expect.poll(() => returned).toBe(true);
    await expect(page.locator('.lb-media-status')).toBeHidden();
    await expect(page.locator('.lb-img')).toBeVisible();
  } finally { release(); await fixture.close(); }
});
