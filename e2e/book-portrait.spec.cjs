const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook } = require('./ui-helpers.cjs');

// Pixels in the middle column of the canvas that differ from the dark page colour (18, 20, 23).
async function bookHeight(page) {
  const png = await page.locator('.ab canvas').screenshot();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    const i = (y * info.width + x) * info.channels;
    if (Math.abs(data[i] - 18) + Math.abs(data[i + 1] - 20) + Math.abs(data[i + 2] - 23) > 60) n++;
  }
  return n;
}

// Two canvas frames 250 ms apart are the same: the camera has stopped gliding between pages.
async function settled(page) {
  const a = await page.locator('.ab canvas').screenshot();
  await page.waitForTimeout(250);
  return a.equals(await page.locator('.ab canvas').screenshot());
}

// Starts only once the camera rests, so the drag begins on the page in view.
async function swipe(page, from, to) {
  await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
  await page.mouse.move(from, 420);
  await page.mouse.down();
  await page.mouse.move(to, 420, { steps: 2 }); // each step waits for a frame, slow on a CPU renderer
  await page.mouse.up();
}

test('the portrait fullscreen hint is readable, touch-sized and hidden in landscape', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Fullscreen hint', 3, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const hint = page.getByRole('button', { name: 'View fullscreen', exact: true });
    await expect(hint).toBeVisible();
    expect((await hint.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const footer = await page.locator('.ab-turn').boundingBox();
    const button = await hint.boundingBox();
    expect(button.y + button.height).toBeLessThan(footer.y);
    if (process.platform === 'darwin') {
      await desktop.evaluate(({ BrowserWindow }) => {
        global.folioPortraitFullscreenEntered = false;
        BrowserWindow.getAllWindows()[0].once('enter-full-screen', () => { global.folioPortraitFullscreenEntered = true; });
      });
    }
    await hint.click();
    if (process.platform === 'darwin') {
      await expect.poll(() => desktop.evaluate(() => global.folioPortraitFullscreenEntered), { timeout: 10_000 }).toBe(true);
    }
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(hint).toBeHidden();
    await page.evaluate(() => { document.exitFullscreen(); });
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hint).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(hint).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hint).toBeVisible();
    await page.evaluate(() => localStorage.setItem('lang', 'zh'));
    await page.reload();
    await expect(page.getByRole('button', { name: '全屏观看', exact: true })).toBeVisible();
  } finally { await fixture.close(); }
});

test('the iPhone fullscreen hint explains Home Screen viewing and hides in standalone mode', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'iPhone fullscreen', 1, 1);
    await page.evaluate((hash) => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
      location.hash = hash;
    }, `#/a/${album.id}/3d`);
    const hint = page.getByRole('button', { name: 'View fullscreen', exact: true });
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(page.locator('.toast')).toContainText('Home Screen');
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.evaluate(() => { location.hash = '#/'; });
    await expect(page.locator('.ab')).toHaveCount(0);
    await page.evaluate((hash) => {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
      location.hash = hash;
    }, `#/a/${album.id}/3d`);
    await expect(page.locator('.ab')).toBeVisible();
    await expect(hint).toBeHidden();
  } finally { await fixture.close(); }
});

test('an upright phone shows one page at a time and swipes through its pages', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const album = await seedBook(page, origin, 'Upright', 3, 1); // three pages plus the title page
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    const next = page.locator('.ab [data-act=next]');
    await expect(count).toHaveText('Page 2 of 5', { timeout: 15000 }); // three.js can take a while on a busy machine
    await expect(page.locator('.ab-rotate')).toHaveCount(0);
    await expect(page.locator('.ab canvas')).toBeVisible();
    // One page fills the width, so the page is about twice as tall as in the two-page view.
    await expect.poll(() => bookHeight(page), { timeout: 15000 }).toBeGreaterThan(240);
    await swipe(page, 300, 60); // turns the leaf: its back is the next page
    await expect(count).toHaveText('Page 3 of 5');
    await swipe(page, 300, 60); // nothing left to turn on a left page: move to the right page
    await expect(count).toHaveText('Page 4 of 5');
    await swipe(page, 90, 330); // back to the left page
    await expect(count).toHaveText('Page 3 of 5');
    await next.click();
    await expect(count).toHaveText('Page 4 of 5');
    await next.click();
    await expect(count).toHaveText('Page 5 of 5');
    await expect(next).toBeDisabled();
  } finally { await fixture.close(); }
});

test('rotating an upright phone to spreads and back keeps the page it shows', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Rotation', 3, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    await expect(count).toHaveText('Page 2 of 5', { timeout: 15000 });
    await page.locator('.ab [data-act=next]').click();
    await expect(count).toHaveText('Page 3 of 5');
    await page.locator('.ab [data-act=next]').click();
    await expect(count).toHaveText('Page 4 of 5');
    await page.locator('.ab [data-act=next]').click();
    await expect(count).toHaveText('Page 5 of 5');
    await page.locator('.ab [data-act=prev]').click();
    await expect(count).toHaveText('Page 4 of 5');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(count).toHaveText('2 / 3');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(count).toHaveText('Page 4 of 5');
  } finally { await fixture.close(); }
});

test('successive portrait pages turn without moving the viewing camera', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  let observedPage;
  try {
    const { page } = await fixture.launch();
    observedPage = page;
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Stationary binding', 3, 1);
    await page.evaluate(() => {
      const prototype = WebGL2RenderingContext.prototype;
      const getLocation = prototype.getUniformLocation;
      const setMatrix = prototype.uniformMatrix4fv;
      const names = new WeakMap();
      window.portraitView = [];
      prototype.getUniformLocation = function (program, name) {
        const location = getLocation.call(this, program, name);
        if (location) names.set(location, name);
        return location;
      };
      prototype.uniformMatrix4fv = function (location, transpose, values, ...rest) {
        if (names.get(location) === 'viewMatrix') window.portraitView = Array.from(values);
        return setMatrix.call(this, location, transpose, values, ...rest);
      };
      window.restorePortraitView = () => {
        prototype.getUniformLocation = getLocation;
        prototype.uniformMatrix4fv = setMatrix;
      };
    });
    await page.evaluate((hash) => { location.hash = hash; }, `#/a/${album.id}/3d`);
    await expect(page.locator('.ab-count')).toHaveText('Page 2 of 5', { timeout: 15000 });
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.portraitView.length)).toBe(16);
    const initial = await page.evaluate(() => window.portraitView);
    for (const expected of ['Page 3 of 5', 'Page 4 of 5']) {
      await page.locator('.ab [data-act=next]').click();
      await expect(page.locator('.ab-count')).toHaveText(expected);
      await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
      const current = await page.evaluate(() => window.portraitView);
      expect(Math.max(...current.map((value, index) => Math.abs(value - initial[index])))).toBeLessThan(.001);
    }
  } finally {
    await observedPage?.evaluate(() => window.restorePortraitView?.()).catch(() => {});
    await fixture.close();
  }
});

test('a canceled upright swipe keeps its page and a following swipe still works', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Canceled swipe', 3, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    await expect(count).toHaveText('Page 2 of 5', { timeout: 15000 });
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    const session = await desktop.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 420 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 420 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 65, y: 420 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(count).toHaveText('Page 2 of 5');
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    await touch(session, [[300, 420], [180, 420], [65, 420]]);
    await expect(count).toHaveText('Page 3 of 5');
    await session.detach();
  } finally { await fixture.close(); }
});

test('a short reversed title-page drag does not close the book', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Reverse on title', 1, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    await expect(count).toHaveText('Page 2 of 3', { timeout: 15000 });
    await page.locator('.ab [data-act=prev]').click();
    await expect(count).toHaveText('Page 1 of 3');
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    const session = await desktop.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y: 420 }] });
    for (const x of [180, 160, 280, 300]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 420 }] });
    }
    await page.waitForTimeout(180);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(count).toHaveText('Page 1 of 3');
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    await touch(session, [[300, 420], [180, 420], [65, 420]]);
    await expect(count).toHaveText('Page 2 of 3');
    await session.detach();
  } finally { await fixture.close(); }
});

test('the upright title retains an opaque light backing for dark-theme contrast', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  let observedPage;
  try {
    const { page } = await fixture.launch();
    observedPage = page;
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const album = await seedBook(page, origin, 'Opaque title', 1, 1);
    await page.evaluate(() => {
      const prototype = CanvasRenderingContext2D.prototype;
      const fillText = prototype.fillText;
      prototype.fillText = function (text, ...rest) {
        const result = fillText.call(this, text, ...rest);
        if (text === 'Opaque title' && this.canvas.width === 839 && this.canvas.height === 770) window.portraitTitleCanvas = this.canvas;
        return result;
      };
      window.restoreTitlePaint = () => { prototype.fillText = fillText; };
    });
    await page.evaluate((hash) => { location.hash = hash; }, `#/a/${album.id}/3d`);
    await expect(page.locator('.ab-count')).toHaveText('Page 2 of 3', { timeout: 15000 });
    await page.locator('.ab [data-act=prev]').click();
    await expect(page.locator('.ab-count')).toHaveText('Page 1 of 3');
    await expect.poll(() => page.evaluate(() => !!window.portraitTitleCanvas)).toBe(true);
    const pixel = await page.evaluate(() => {
      const canvas = window.portraitTitleCanvas;
      return [...canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 4), 1, 1).data];
    });
    expect(pixel[3]).toBe(255);
    expect(Math.min(...pixel.slice(0, 3))).toBeGreaterThan(180);
  } finally {
    await observedPage?.evaluate(() => window.restoreTitlePaint?.()).catch(() => {});
    await fixture.close();
  }
});

test('every upright content page bends under the finger before advancing', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Paper under a finger', 3, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    const canvas = page.locator('.ab canvas');
    await expect(count).toHaveText('Page 2 of 5', { timeout: 15000 });
    const session = await desktop.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    for (const [current, next] of [[2, 3], [3, 4]]) {
      await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
      const before = await canvas.screenshot();
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 420 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 420 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 420 }] });
      await expect.poll(async () => before.equals(await canvas.screenshot())).toBe(false);
      await expect(count).toHaveText(`Page ${current} of 5`);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(count).toHaveText(`Page ${next} of 5`);
    }
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    const resting = await canvas.screenshot();
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 420 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 285, y: 420 }] });
    await page.waitForTimeout(200);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(count).toHaveText('Page 4 of 5');
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    expect(resting.equals(await canvas.screenshot())).toBe(true);
    await touch(session, [[300, 420], [180, 420], [65, 420]]);
    await expect(count).toHaveText('Page 5 of 5');
    await touch(session, [[300, 420], [180, 420], [65, 420]]);
    await expect(count).toHaveText('Page 5 of 5');
    await session.detach();
  } finally { await fixture.close(); }
});

test('upright photo taps follow the displayed page through forward, reverse and rotation', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Displayed photo', 3, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    await expect(count).toHaveText('Page 2 of 5', { timeout: 15000 });
    for (const [photo, action] of [[0, null], [1, 'next'], [2, 'next'], [1, 'prev']]) {
      if (action) await page.locator(`.ab [data-act=${action}]`).click();
      await expect(count).toHaveText(`Page ${photo + 2} of 5`);
      await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
      await page.mouse.click(220, 400);
      await expect(page.locator('.lb')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/p/${album.photos[photo].id}$`));
      await page.locator('.lb [data-act=close]').evaluate((element) => element.click());
      await expect(page.locator('.lb')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(count).toHaveText('Page 3 of 5');
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    await page.mouse.click(220, 400);
    await expect(page).toHaveURL(new RegExp(`/p/${album.photos[1].id}$`));
  } finally { await fixture.close(); }
});

test('auto-flip on an upright phone steps one page at a time and closes after the last page', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Upright play', 1, 1); // one page: title page + page 2 of 3
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab-count')).toHaveText('Page 2 of 3', { timeout: 15000 });
    await page.locator('.ab-turn [data-act=play]').click();
    await page.locator('.ab-speed [data-speed=fast]').click();
    await expect(page.locator('.ab-count')).toHaveText('Page 3 of 3', { timeout: 6000 });
    await expect(page.locator('.ab-shut')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('an upright phone stays on the page it shows when the album changes under the book', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Stay', 3, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    await expect(count).toHaveText('Page 2 of 5', { timeout: 15000 });
    await page.locator('.ab [data-act=next]').click();
    await expect(count).toHaveText('Page 3 of 5'); // the left page: photo 2
    await page.evaluate((hash) => { location.hash = hash; }, `#/a/${album.id}/3d/p/${album.photos[1].id}`);
    await expect(page.locator('.lb')).toBeVisible();
    await page.locator('.lb [data-act=menu-cover]').evaluate((el) => el.click());
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).cover).toBe(album.photos[1].id);
    await page.locator('.lb [data-act=close]').evaluate((el) => el.click());
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(count).toHaveText('Page 3 of 5');
  } finally { await fixture.close(); }
});

// A real finger on the screen: the browser makes touch pointer events from it.
async function touch(session, points) {
  const [first, ...rest] = points;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first[0], y: first[1] }] });
  for (const [x, y] of rest) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('a phone held sideways shows only the album: a swipe turns the page, a tap on empty space brings the controls back', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 844, height: 390 });
    const album = await seedBook(page, origin, 'Sideways', 3, 1);
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const book = page.locator('.ab');
    const count = page.locator('.ab-count');
    await expect(count).toHaveText('1 / 3', { timeout: 15000 });
    await expect(book).toHaveAttribute('data-idle', '', { timeout: 5000 });
    await expect.poll(() => page.locator('.ab-foot').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
    const session = await desktop.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    await touch(session, [[760, 200], [600, 200], [400, 200], [150, 200]]);
    await expect(count).toHaveText('2 / 3');
    await expect(book).toHaveAttribute('data-idle', '');
    await expect.poll(() => settled(page), { timeout: 15000 }).toBe(true);
    await touch(session, [[422, 12]]); // above the album
    await expect(page.locator('.ab[data-idle]')).toHaveCount(0);
    await expect(count).toHaveText('2 / 3');
    await expect(book).toHaveAttribute('data-idle', '', { timeout: 5000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.ab[data-idle]')).toHaveCount(0);
    await page.waitForTimeout(3500);
    await expect(page.locator('.ab[data-idle]')).toHaveCount(0);
  } finally { await fixture.close(); }
});
