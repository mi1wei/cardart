const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook } = require('./ui-helpers.cjs');

// Three photos at one a page: three pages, so spreads 1–3.
async function openBook(page) {
  const origin = new URL(page.url()).origin;
  const album = await seedBook(page, origin, 'Auto', 3, 1);
  // Auto-flip is timed, so tests start it once the pages are loaded and drawn: on a CPU renderer each
  // texture upload holds the page for seconds and would delay the step under test.
  const loading = new Set();
  const track = (request) => { if (new URL(request.url()).pathname.startsWith('/media/')) loading.add(request); };
  const done = (request) => loading.delete(request);
  page.on('request', track);
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  const frames = await page.evaluateHandle(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    let last = performance.now();
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => {
        pending.delete(id);
        try { callback.call(window, time); }
        finally { last = performance.now(); }
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
      cancel(id);
    };
    return { quiet: () => (pending.size ? 0 : performance.now() - last) };
  });
  try {
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab-count')).toHaveText('1 / 3', { timeout: 15000 }); // three.js can take a while on a busy machine
    await expect.poll(async () => (loading.size ? 0 : await frames.evaluate((state) => state.quiet())), { timeout: 30_000 }).toBeGreaterThan(1000);
  } finally {
    page.off('request', track);
    page.off('requestfinished', done);
    page.off('requestfailed', done);
  }
  return { origin, album };
}

test('auto-flip turns spreads at the chosen speed, closes the book at the end and remembers the speed', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    const count = page.locator('.ab-count');
    await expect(page.locator('.ab-bar [data-act=close]')).toHaveText(/Back|返回/);
    await page.locator('.ab-turn [data-act=play]').click();
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await expect(page.locator('.ab-turn')).toBeHidden();
    await expect(page.locator('.ab-progress')).toBeVisible();
    // Time the step in the page: a frame on a CPU renderer can hold up the test's own checks for seconds.
    await page.evaluate(() => {
      const times = window.flipTimes = {};
      const fast = document.querySelector('.ab-speed [data-speed=fast]');
      const shown = document.querySelector('.ab-count');
      new MutationObserver(() => { if (fast.getAttribute('aria-pressed') === 'true') times.fast ??= performance.now(); })
        .observe(fast, { attributes: true, attributeFilter: ['aria-pressed'] });
      new MutationObserver(() => { times[shown.textContent] ??= performance.now(); })
        .observe(shown, { childList: true, characterData: true, subtree: true });
    });
    await page.locator('.ab-speed [data-speed=fast]').click();
    await expect(page.locator('.ab-speed [data-speed=fast]')).toHaveAttribute('aria-pressed', 'true');
    await expect(count).toHaveText('2 / 3', { timeout: 15_000 });
    const step = await page.evaluate(() => window.flipTimes['2 / 3'] - window.flipTimes.fast);
    expect(step, 'the next spread waits for the fast interval').toBeGreaterThan(3000);
    expect(step, 'and comes before the default interval would end').toBeLessThan(6000);
    await expect(count).toHaveText('3 / 3', { timeout: 15_000 });
    await expect(page.locator('.ab-shut')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
    await expect(page.locator('.ab-progress')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('flip-speed'))).toBe('fast');
    await page.reload();
    await expect(count).toHaveText('1 / 3');
    await page.locator('.ab-turn [data-act=play]').click();
    await expect(page.locator('.ab-speed [data-speed=fast]')).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.close(); }
});

test('playing from the cover opens the book; Space pauses and resumes once; Escape stops before it closes', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    await page.locator('.ab-bar [data-act=cover]').click();
    await expect(page.locator('.ab-shut')).toBeVisible();
    await page.locator('.ab-shut [data-act=play]').click();
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await expect(page.locator('.ab-shut')).toBeHidden();
    await expect(page.locator('.ab-bar [data-act=cover]')).not.toHaveAttribute('hidden', '');
    await expect(page.locator('.ab-player [data-act=pause]')).toBeFocused();
    await page.keyboard.press(' ');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
    await expect(page.locator('.ab-player [data-act=pause]')).toHaveAttribute('aria-label', /Resume|继续/);
    await page.locator('.ab-speed [data-speed=fast]').click();
    await page.waitForTimeout(4500);
    await expect(page.locator('.ab-count')).toHaveText('1 / 3');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
    await page.keyboard.press(' ');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
    await expect(page.locator('.ab-turn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ab')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('opening a photo pauses auto-flip, and moving the mouse brings the faded controls back', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const { album } = await openBook(page);
    await page.locator('.ab-turn [data-act=play]').click();
    await page.mouse.move(5, 5);
    await expect(page.locator('.ab')).toHaveAttribute('data-idle', '', { timeout: 5000 });
    await expect.poll(() => page.locator('.ab-bar').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
    await page.mouse.move(300, 300);
    await expect(page.locator('.ab[data-idle]')).toHaveCount(0);
    await page.evaluate((hash) => { location.hash = hash; }, `#/a/${album.id}/3d/p/${album.photos[0].id}`);
    await expect(page.locator('.lb')).toBeVisible();
    await page.waitForTimeout(6500); // longer than one step at the default speed
    await page.locator('.lb [data-act=close]').click(); // Escape would close Details first
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.ab-count')).toHaveText('1 / 3');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
  } finally { await fixture.close(); }
});

test('faded controls stay hidden across page turns until the mouse moves', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    await page.locator('.ab-turn [data-act=play]').click();
    await page.locator('.ab-speed [data-speed=fast]').click();
    await page.mouse.move(5, 5);
    await expect(page.locator('.ab')).toHaveAttribute('data-idle', '', { timeout: 5000 });
    await page.evaluate(() => {
      window.shown = 0;
      const ab = document.querySelector('.ab');
      new MutationObserver(() => { if (!ab.hasAttribute('data-idle')) window.shown++; }).observe(ab, { attributes: true, attributeFilter: ['data-idle'] });
    });
    await expect(page.locator('.ab-count')).toHaveText('2 / 3', { timeout: 6000 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.shown)).toBe(0);
  } finally { await fixture.close(); }
});

test('holding a page while auto-flip plays waits a full step after the press', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    await page.locator('.ab-turn [data-act=play]').click();
    await page.locator('.ab-speed [data-speed=slow]').click(); // the next step is 8 s from here
    const scheduled = Date.now();
    await page.waitForTimeout(6000);
    const box = await page.locator('.ab canvas').boundingBox();
    const [x, y] = [box.x + box.width * 0.75, box.y + box.height / 2];
    await page.mouse.move(x, y);
    const pressed = Date.now();
    await page.mouse.down();
    await page.mouse.move(x - 30, y); // one move: each step waits for a frame, which takes seconds on a CPU renderer
    // Past the old 8 s mark, before press + 8 s: timed from the press, since input can lag on a slow machine.
    await page.waitForTimeout(Math.max(0, Math.max(scheduled + 9000, pressed + 3000) - Date.now()));
    const count = await page.locator('.ab-count').textContent();
    expect(Date.now() - scheduled, 'checked after the original step was due').toBeGreaterThan(8500);
    expect(Date.now() - pressed, 'checked before a full step after the press').toBeLessThan(8000);
    expect(count).toBe('1 / 3');
    await page.mouse.move(x, y);
    await page.mouse.up();
  } finally { await fixture.close(); }
});

test('when auto-flip ends, focus returns to the play button; a lost GL context stops it', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    await page.locator('.ab-turn [data-act=play]').click();
    await expect(page.locator('.ab-player [data-act=pause]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ab-turn [data-act=play]')).toBeFocused();
    await page.locator('.ab-turn [data-act=play]').click();
    await page.locator('.ab canvas').evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await expect(page.locator('.ab')).toHaveAttribute('data-error', '');
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
    await expect(page.locator('.ab-progress')).toBeHidden();
  } finally { await fixture.close(); }
});
