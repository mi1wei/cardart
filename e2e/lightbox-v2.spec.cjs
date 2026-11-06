const { test, expect } = require('@playwright/test');
const { readFile, mkdir } = require('node:fs/promises');
const { join, dirname } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');
const { seedMixed, openAlbum } = require('./video-fixtures.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');

const visibleActions = (page) => page.locator('.lb-bar').evaluate((bar) =>
  [...bar.querySelectorAll('button')].filter((button) => button.getClientRects().length).map((button) => button.dataset.act));
const imageFitsStage = (page) => page.evaluate(() => {
  const image = document.querySelector('.lb-img').getBoundingClientRect();
  const stage = document.querySelector('.lb-stage').getBoundingClientRect();
  return image.width > 0 && image.left >= stage.left - 1 && image.right <= stage.right + 1 && image.top >= stage.top - 1 && image.bottom <= stage.bottom + 1;
});
// Media query listeners run in the rendering update, before animation frame callbacks.
const nextFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
// The computer card is open; wait until the phone layout has closed it before touching details.
async function toPhone(page, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await expect(page.locator('.lb-details')).toBeHidden();
}

async function open(fixture, options = {}) {
  const album = await test.step('Prepare mixed-media album', () => seedMixed(fixture, options));
  const launched = await openAlbum(fixture, album, { suffix: '/p/p001', ...options });
  await expect(launched.page.locator('.lb')).toBeVisible();
  return { ...launched, album };
}

async function swipe(page, dx, dy = 0) {
  const stage = page.locator('.lb-stage');
  await stage.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: 190, clientY: 300, button: 0 });
  await stage.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: 190 + dx, clientY: 300 + dy });
  await stage.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: 190 + dx, clientY: 300 + dy });
}

test('a computer shows the photo beside open details on a page that follows the app theme', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, album } = await open(fixture);
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.reload();
    const details = page.locator('.lb-details');
    await expect(page.locator('.lb')).toHaveCSS('background-color', 'rgb(247, 249, 251)');
    await expect(page.locator('.lb-bar')).toHaveCSS('height', '64px');
    await expect(page.locator('.lb-back')).toHaveText('Albums', { useInnerText: true });
    await expect(page.locator('.lb-brand')).toHaveText('Folio');
    await expect(page.locator('.lb-bar-album')).toHaveText(album.title);
    expect(await visibleActions(page)).toEqual(['close', 'prev', 'next', 'details']);
    await expect(page.locator('.lb-filmstrip')).toBeHidden();
    await expect(details).toBeVisible();
    await expect(details).toHaveCSS('width', '370px');
    await expect(page.locator('[data-field=dimensions]')).toHaveText('1200 × 800');
    const preview = await page.locator('.lb-preview').boundingBox();
    const card = await details.boundingBox();
    expect(card.x - (preview.x + preview.width)).toBeCloseTo(24, 0);
    await expect.poll(() => imageFitsStage(page)).toBe(true);
    const image = await page.locator('.lb-img').boundingBox();
    await page.screenshot({ path: test.info().outputPath('computer-light.png') });
    await page.locator('.lb-bar [data-act=details]').click();
    await expect(details).toBeHidden();
    expect((await page.locator('.lb-preview').boundingBox()).width).toBeGreaterThan(preview.width + 300);
    await expect.poll(async () => (await page.locator('.lb-img').boundingBox()).width).toBeGreaterThan(image.width + 100);
    await expect.poll(() => imageFitsStage(page)).toBe(true);
    await page.reload();
    await expect(page.locator('.lb-img')).toBeVisible();
    await expect(details).toBeHidden();
    // The phone keeps its own choice.
    expect(await page.evaluate(() => localStorage.getItem('lightbox-details'))).toBeNull();
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload();
    await expect(page.locator('.lb')).toHaveCSS('background-color', 'rgb(18, 20, 23)');
    await page.screenshot({ path: test.info().outputPath('computer-dark.png') });
  } finally { await fixture.close(); }
});

test('a phone keeps the dark fullscreen viewer, its own details choice and the mixed-media filmstrip', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, album } = await open(fixture);
    await page.setViewportSize({ width: 390, height: 844 });
    const details = page.locator('.lb-details');
    await expect(page.locator('.lb')).toHaveCSS('background-color', 'rgb(13, 15, 17)');
    await expect(details).toBeHidden();
    await expect(page.locator('.lb-back')).toHaveText(album.title, { useInnerText: true });
    await expect(page.locator('.lb-brand')).toBeHidden();
    await expect(page.locator('.lb-bar-album')).toBeHidden();
    expect(await visibleActions(page)).toEqual(['close', 'details', 'original', 'menu']);
    await expect(page.locator('.lb-filmstrip button')).toHaveCount(2);
    await expect(page.locator('.lb-filmstrip [aria-current=true]')).toHaveAccessibleName(/photo.jpg/);
    await expect(page.locator('.lb-filmstrip [data-kind=video] .lb-film-play')).toBeVisible();
    await expect.poll(() => imageFitsStage(page)).toBe(true);
    const image = await page.locator('.lb-img').boundingBox();
    await page.keyboard.press('i');
    await expect(details).toBeVisible();
    expect((await page.locator('.lb-img').boundingBox()).width).toBeCloseTo(image.width, 0);
    await page.reload();
    await expect(details).toBeVisible();
    await page.locator('.lb-bar [data-act=details]').click();
    await page.locator('.lb-filmstrip button').nth(1).click();
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await expect(page.locator('.lb-filmstrip [aria-current=true]')).toHaveAccessibleName(/clip.mp4/);
    await page.reload();
    await expect(details).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('phone-dark.png') });
  } finally { await fixture.close(); }
});

test('each layout keeps its own details choice, and an old closed choice does not hide the computer card', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    const details = page.locator('.lb-details');
    const toggle = page.locator('.lb-bar [data-act=details]');
    await page.evaluate(() => localStorage.setItem('lightbox-details', 'false'));
    await page.reload();
    await expect(details).toBeVisible();
    await page.setViewportSize({ width: 860, height: 800 });
    await expect(details).toBeHidden();
    await toggle.click();
    await expect(details).toBeVisible();
    await page.setViewportSize({ width: 1180, height: 800 });
    await expect(details).toBeVisible();
    await toggle.click();
    await expect(details).toBeHidden();
    await page.setViewportSize({ width: 860, height: 800 });
    await expect(details).toBeVisible();
    expect(await page.evaluate(() => ['lightbox-details', 'lightbox-details-desktop'].map((key) => localStorage.getItem(key)))).toEqual(['true', 'false']);
  } finally { await fixture.close(); }
});

test('changing between computer and phone widths keeps an unsaved note without asking', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    const asked = [];
    page.on('dialog', (dialog) => { asked.push(dialog.message()); return dialog.dismiss(); });
    await expect(page.locator('.lb-details')).toBeVisible();
    await page.locator('[data-note-edit]').click();
    await page.getByLabel('Note text', { exact: true }).fill('Draft across layouts');
    await page.setViewportSize({ width: 860, height: 800 });
    await nextFrames(page);
    await expect(page.locator('.lb-details')).toBeVisible();
    await page.setViewportSize({ width: 1180, height: 800 });
    await nextFrames(page);
    await expect(page.locator('.lb-details')).toBeVisible();
    await expect(page.locator('.note-input')).toHaveValue('Draft across layouts');
    expect(asked).toEqual([]);
  } finally { await fixture.close(); }
});

test('small computer windows keep a long name and camera beside the photo without sideways scrolling', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    const name = `${'Very-long-unbroken-file-name-'.repeat(6)}.jpg`;
    const data = await photoBytes({ width: 1200, height: 800, exif: { IFD0: { Make: 'Folio Test', Model: 'Extremely-long-camera-model-name-'.repeat(3) } } });
    const response = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=${encodeURIComponent(name)}`, { headers: { 'X-Album-Upload': '1' }, data });
    expect(response.ok()).toBe(true);
    const { photo } = await response.json();
    // Without a hashchange: the open album does not know the upload yet and would drop the address.
    await page.evaluate((hash) => history.replaceState(null, '', hash), `#/a/${album.id}/p/${photo.id}`);
    await page.reload();
    await expect(page.locator('[data-field=camera]')).toContainText('Extremely-long-camera-model-name-');
    for (const [width, height] of [[861, 640], [900, 640]]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('.lb-brand')).toBeVisible();
      await expect(page.locator('.lb-details')).toHaveCSS('width', '370px');
      expect(await page.locator('.lb').evaluate((root) => root.scrollWidth - root.clientWidth)).toBeLessThanOrEqual(0);
      const card = await page.locator('.lb-details').boundingBox();
      const title = await page.locator('.lb-name').boundingBox();
      expect(title.x + title.width).toBeLessThanOrEqual(card.x + card.width);
    }
    // Long details scroll the page while the photo stays in view.
    await page.locator('.lb').evaluate((root) => root.scrollTo(0, root.scrollHeight));
    await expect.poll(() => page.locator('.lb').evaluate((root) => root.scrollTop)).toBeGreaterThan(0);
    expect((await page.locator('.lb-preview').boundingBox()).y).toBeCloseTo(88, 0);
    await page.setViewportSize({ width: 860, height: 640 });
    await expect(page.locator('.lb-brand')).toBeHidden();
    await expect(page.locator('.lb')).toHaveCSS('background-color', 'rgb(13, 15, 17)');
    expect((await page.locator('.lb-bar').boundingBox()).y).toBe(0);
  } finally { await fixture.close(); }
});

test('on a phone the filmstrip fades after two seconds, restores on pointer or touch and remains keyboard accessible', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.lb-filmstrip')).toHaveCSS('opacity', '0');
    await page.locator('.lb-stage').dispatchEvent('pointermove', { clientX: 100, clientY: 100 });
    await expect(page.locator('.lb-filmstrip')).toHaveCSS('opacity', '1');
    await expect(page.locator('.lb-filmstrip')).toHaveCSS('opacity', '0');
    await page.locator('.lb-stage').dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch', clientX: 100, clientY: 100 });
    await expect(page.locator('.lb-filmstrip')).toHaveCSS('opacity', '1');
    await page.locator('.lb-stage').dispatchEvent('pointercancel', { pointerId: 8, pointerType: 'touch' });
    await page.locator('.lb-filmstrip button').first().focus();
    await expect(page.locator('.lb-filmstrip')).toHaveCSS('opacity', '1');
  } finally { await fixture.close(); }
});

test('zoom anchors wheel input, pans with a visible minimap and resets before details or lightbox on Escape', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    await page.locator('.lb-stage').dispatchEvent('wheel', { deltaY: -500, clientX: 350, clientY: 300, ctrlKey: true });
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'true');
    await expect(page.locator('.lb-minimap')).toBeVisible();
    const before = await page.locator('.lb-minimap-viewport').boundingBox();
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(520, 360, { steps: 4 });
    await page.mouse.up();
    const after = await page.locator('.lb-minimap-viewport').boundingBox();
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(1);
    await swipe(page, -120);
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await page.keyboard.press('Escape');
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'false');
    await expect(page.locator('.lb-minimap')).toBeHidden();
    await expect(page.locator('.lb-details')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lb-details')).toBeHidden();
    await expect(page.locator('.lb-bar [data-act=details]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lb')).toHaveCount(0);
    // On a computer Escape hides the card for now; only the Details button changes the remembered choice.
    await page.locator('.tile').first().click();
    await expect(page.locator('.lb-details')).toBeVisible();
  } finally { await fixture.close(); }
});

test('fit, actual pixels, double-click and keyboard zoom operate only on photos', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    await page.setViewportSize({ width: 900, height: 650 });
    // A computer shows the zoom controls only once the photo is zoomed.
    await expect(page.locator('.lb-zoom')).toBeHidden();
    await page.keyboard.press('+');
    await page.locator('[data-act=actual]').click();
    const actual = await page.locator('.lb-img').boundingBox();
    expect(actual.width).toBeCloseTo(1200, 0);
    expect(actual.height).toBeCloseTo(800, 0);
    await page.keyboard.press('0');
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'false');
    await page.keyboard.press('+');
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'true');
    await page.keyboard.press('-');
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'false');
    await page.locator('.lb-img').dblclick();
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'true');
    await page.locator('.lb-img').dblclick();
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.lb-zoom')).toBeHidden();
    await page.keyboard.press('+');
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'false');
  } finally { await fixture.close(); }
});

test('phone swipes navigate, open the bottom sheet or close, while a two-finger pinch never pages', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await open(fixture);
    await toPhone(page);
    await swipe(page, 0, -100);
    await expect(page.locator('.lb-details')).toBeVisible();
    const sheet = await page.locator('.lb-details').boundingBox();
    expect(sheet.y + sheet.height).toBeCloseTo(844, 0);
    await expect(page.locator('.lb-details [data-act=sheet-cover]')).toBeVisible();
    await expect(page.locator('.lb-details [data-act=sheet-delete]')).toBeVisible();
    // The sheet's cover button reads like the ⋯ menu's, and says why it is greyed out.
    const cover = page.locator('.lb-details [data-act=sheet-cover]');
    await expect(cover).toHaveText('Already the cover');
    await expect(cover).toBeDisabled();
    expect(await cover.locator('svg').innerHTML()).toBe(await page.locator('.lb-menu [data-act=menu-cover] svg').innerHTML());
    await page.keyboard.press('Escape');
    const session = await desktop.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 350, id: 1 }, { x: 240, y: 350, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 70, y: 350, id: 1 }, { x: 290, y: 350, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.lb')).toHaveAttribute('data-zoomed', 'true');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await swipe(page, -100);
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    await page.keyboard.press('0');
    await swipe(page, -100);
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await expect(page.locator('.lb-details [data-act=sheet-cover]')).toHaveText('Set as album cover');
    await expect(page.locator('.lb-bar [data-act=menu]')).toBeVisible();
    await page.locator('.lb-bar [data-act=menu]').click();
    await expect(page.locator('.lb-menu [data-act=menu-cover]')).toBeVisible();
    await expect(page.locator('.lb-menu [data-act=menu-delete]')).toBeVisible(); // phones have no Delete in the bar
    await page.keyboard.press('Escape');
    await swipe(page, 0, 100);
    await expect(page.locator('.lb')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('on a 320px phone the sheet cover button keeps its icon and its label inside', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    await toPhone(page, 320, 640);
    const cover = page.locator('.lb-details [data-act=sheet-cover]');
    const fits = () => cover.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const label = button.querySelector('span').getBoundingClientRect();
      return {
        icon: button.querySelector('svg').getBoundingClientRect().width,
        inside: label.left >= box.left + parseFloat(style.paddingLeft) - 0.5 && label.right <= box.right - parseFloat(style.paddingRight) + 0.5,
      };
    });
    await swipe(page, 0, -100);
    await expect(cover).toHaveText('Already the cover');
    expect(await fits()).toEqual({ icon: 17, inside: true });
    await page.keyboard.press('Escape');
    await swipe(page, -100);
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await swipe(page, 0, -100);
    await expect(cover).toHaveText('Set as album cover');
    expect(await fits()).toEqual({ icon: 17, inside: true });
  } finally { await fixture.close(); }
});

test('at phone width the ⋯ menu opens under its button when the Windows window buttons push the bar in', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await open(fixture);
    // Resize the real window: an emulated viewport leaves the Windows title-bar values at the window's width.
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(860, 800));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(860);
    // A Mac runs the Windows rules too: without window-controls-overlay values they fall back to 24px.
    await page.evaluate(() => { document.documentElement.dataset.desktop = 'win'; });
    const button = page.locator('.lb-bar [data-act=menu]');
    await button.click();
    const menu = page.locator('.lb-menu');
    await expect(menu).toBeVisible();
    const [b, m] = [await button.boundingBox(), await menu.boundingBox()];
    expect(Math.abs(b.x + b.width - (m.x + m.width))).toBeLessThanOrEqual(1);
    const titleBarEnd = await page.evaluate(() => (navigator.windowControlsOverlay?.visible ? navigator.windowControlsOverlay.getTitlebarAreaRect().right : null));
    if (titleBarEnd !== null) expect(m.x + m.width).toBeLessThanOrEqual(titleBarEnd);
  } finally { await fixture.close(); }
});

test('video Space toggles outside native controls without replacing a paused video during same-photo updates', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.locator('.lb-video').evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(1);
    await page.locator('.lb-video').evaluate(async (video) => {
      video.pause();
      const sought = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
      video.currentTime = 0.75;
      await sought;
      window.sameS2Video = video;
    });
    const cover = page.locator('.lb-details [data-act=sheet-cover]');
    await cover.click();
    // The card greys the button out once the update has landed.
    await expect(cover).toBeDisabled();
    expect(await page.locator('.lb-video').evaluate((video) => video === window.sameS2Video && video.paused && Math.abs(video.currentTime - 0.75) < 0.02)).toBe(true);
    await page.locator('.lb').focus();
    await page.keyboard.press('Space');
    await expect.poll(() => page.locator('.lb-video').evaluate((video) => video.paused)).toBe(false);
    await page.keyboard.press('Space');
    await expect.poll(() => page.locator('.lb-video').evaluate((video) => video.paused)).toBe(true);
    await page.locator('.lb-bar [data-act=details]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.lb-details')).toBeHidden();
    await page.keyboard.press('Space');
    await expect(page.locator('.lb-details')).toBeVisible();
    expect(await page.locator('.lb-video').evaluate((video) => video.paused)).toBe(true);
    await page.locator('[data-note-edit]').click();
    await page.getByLabel('Note text', { exact: true }).fill('Space + - 0 I');
    await page.keyboard.press('Space');
    await expect(page.locator('.note-input')).toHaveValue('Space + - 0 I ');
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    expect(await page.locator('.lb-video').evaluate((video) => video.paused)).toBe(true);
  } finally { await fixture.close(); }
});

test('download saves the exact original bytes, not a rendered preview', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, desktop, album } = await open(fixture);
    const original = await readFile(join(fixture.library, 'albums', album.id, 'originals', album.photos[0].file));
    const destination = test.info().outputPath('original.jpg');
    await mkdir(dirname(destination), { recursive: true });
    await desktop.evaluate((_, path) => {
      global.folioTestDesktop.window.webContents.session.once('will-download', (event, item) => {
        item.setSavePath(path);
        item.once('done', (_, state) => { global.s2Download = { state, name: item.getFilename() }; });
      });
    }, destination);
    await page.locator('.lb-details [data-act=original]').click();
    await expect.poll(() => desktop.evaluate(() => global.s2Download)).toEqual({ state: 'completed', name: 'photo.jpg' });
    expect(await readFile(destination)).toEqual(original);
    await expect(page.locator('.lb')).toBeVisible();
  } finally { await fixture.close(); }
});

test('deleted items expose keyboard reachable undo and restore without losing the open viewer', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    await page.locator('.lb-details [data-act=delete]').click();
    await page.locator('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.lb-count')).toHaveText('1 / 1');
    const undo = page.locator('.undo-toast button');
    await expect(undo).toBeVisible();
    await page.locator('.lb').focus();
    for (let i = 0; i < 16 && !await undo.evaluate((button) => button === document.activeElement); i++) await page.keyboard.press('Tab');
    await expect(undo).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    const saved = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(saved.photos.map((photo) => photo.id).sort()).toEqual(['p001', 'p002']);
  } finally { await fixture.close(); }
});

test('Escape and detail close preserve the note saving and unsaved draft gates', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  try {
    const { page, origin, album } = await open(fixture);
    await page.locator('[data-note-edit]').click();
    await page.getByLabel('Note text', { exact: true }).fill('Keep this draft');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('[data-act=details-close]').click();
    await expect(page.locator('.lb-details')).toBeVisible();
    await expect(page.locator('.note-input')).toHaveValue('Keep this draft');
    await page.route(`${origin}/api/albums/${album.id}/photos/p001/note`, async (route) => {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.note-form')).toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.note-input')).toHaveValue('Keep this draft');
    await expect(page.locator('.lb-details')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    release();
    await expect(page.locator('.note-text')).toHaveText('Keep this draft');
  } finally { release?.(); await fixture.close(); }
});

test('trash preview resolves its own media and only invokes restore or confirmed purge without active-album writes', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    await page.locator('.lb [data-act=close]').click();
    await expect(page.locator('.lb')).toHaveCount(0);
    // Load the exported component without introducing a test hook into the application.
    const { build } = await import('vite');
    const bundle = await build({
      configFile: false, logLevel: 'silent',
      plugins: [{
        name: 's2-test-entry',
        resolveId: (id) => id.endsWith('virtual:s2-lightbox') ? '\0s2-test-entry' : null,
        load: (id) => id === '\0s2-test-entry' ? `export { openLightbox } from ${JSON.stringify(join(__dirname, '../src/lightbox.js'))}; export { refreshLicense } from ${JSON.stringify(join(__dirname, '../src/license.js'))};` : null,
      }],
      build: { write: false, lib: { entry: 'virtual:s2-lightbox', formats: ['es'] }, rollupOptions: { output: { codeSplitting: false } } },
    });
    const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find((file) => file.type === 'chunk').code;
    await page.route('**/s2-lightbox.js', (route) => route.fulfill({ contentType: 'text/javascript', body: code }));
    await page.evaluate(async ({ album, origin }) => {
      const { openLightbox, refreshLicense } = await import(`${origin}/s2-lightbox.js`);
      await refreshLicense();
      window.preview = openLightbox({
        album, index: 0, media: (photo, size) => `${origin}/media/${album.id}/${photo.id}/${size}?trash-preview`,
        trashActions: { restore: async () => { if (window.failRestoreS2) throw Error('Owned restore failure'); if (!window.canRestoreS2) return false; window.restoredS2 = true; }, purge: async () => { window.purgedS2 = true; } },
        onAlbum: () => { throw Error('Trash must not mutate the active album'); },
        onClose: () => window.preview.close(),
      });
    }, { album, origin });
    await expect(page.locator('.lb-img')).toHaveAttribute('src', /trash-preview/);
    await expect(page.locator('.lb-bar [data-act]')).toHaveCount(5);
    await expect(page.locator('.lb-back')).toHaveText('Recently Deleted', { useInnerText: true });
    // The light computer bar keeps Restore and Delete permanently readable.
    const ink = await page.locator('.lb-brand').evaluate((node) => getComputedStyle(node).color);
    for (const act of ['restore', 'purge']) await expect(page.locator(`.lb-bar [data-act=${act}]`)).toHaveCSS('color', ink);
    await expect(page.locator('.lb-details')).toHaveCount(0);
    await page.keyboard.press('i');
    await expect(page.locator('.lb-details')).toHaveCount(0);
    await page.locator('[data-act=purge]').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(() => window.purgedS2)).toBeUndefined();
    await page.locator('[data-act=restore]').click();
    await expect(page.locator('.lb')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.locator('.lb-video').evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(1);
    await page.locator('.lb-video').evaluate(async (video) => {
      video.pause();
      const sought = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
      video.currentTime = 0.75;
      await sought;
    });
    await page.evaluate(() => { window.failRestoreS2 = true; });
    await page.locator('[data-act=restore]').click();
    await expect(page.locator('.toast')).toContainText('Owned restore failure');
    await expect(page.locator('.lb-video')).toBeVisible();
    await expect.poll(() => page.locator('.lb-video').evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.lb-video').evaluate((video) => video.paused)).toBe(true);
    await expect.poll(() => page.locator('.lb-video').evaluate((video) => video.currentTime)).toBeCloseTo(0.75, 2);
    await page.evaluate(() => { window.failRestoreS2 = false; });
    await page.evaluate(() => { window.canRestoreS2 = true; });
    await page.locator('[data-act=restore]').click();
    await expect(page.locator('.lb')).toHaveCount(0);
    expect(await page.evaluate(() => window.restoredS2)).toBe(true);
    const unchanged = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(unchanged.photos.map((photo) => photo.id)).toEqual(album.photos.map((photo) => photo.id));
  } finally { await fixture.close(); }
});

test('a computer bar pages and opens details, while the card downloads, deletes and sets the cover', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    expect(await visibleActions(page)).toEqual(['close', 'prev', 'next', 'details']);
    await expect(page.locator('.lb-bar [data-act=details]')).toHaveText('Details');
    const card = page.locator('.lb-details');
    const original = card.locator('[data-act=original]');
    const remove = card.locator('[data-act=delete]');
    const cover = card.locator('[data-act=sheet-cover]');
    await expect(original).toHaveText('Download original');
    await expect(original).toHaveAccessibleName('Download original');
    await expect(remove).toHaveAccessibleName('Delete photo');
    await expect(card.locator('[data-act=sheet-delete]')).toBeHidden(); // Delete sits beside the name
    await expect(cover).toBeDisabled();
    await expect(cover).toHaveText('Already the cover');
    await page.locator('.lb-bar [data-act=next]').click();
    await expect(page.locator('.lb-count')).toHaveText('2 / 2');
    await expect(original).toHaveText('Download original video');
    await expect(original).toHaveAccessibleName('Download original video');
    await expect(remove).toHaveAccessibleName('Delete video');
    await expect(cover).toBeEnabled();
    await expect(cover).toHaveText('Set as album cover');
    await cover.click();
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).cover).toBe(album.photos[1].id);
    await expect(cover).toBeDisabled();
    // A phone keeps Download and More in its bar, labelled for the current item.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await visibleActions(page)).toEqual(['close', 'details', 'original', 'menu']);
    await expect(page.locator('.lb-bar [data-act=original]')).toHaveAccessibleName('Download original video');
  } finally { await fixture.close(); }
});

test('More on a phone copies or moves the current item to another album, then shows the next one', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    await page.setViewportSize({ width: 860, height: 800 });
    const kyoto = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Kyoto' } })).json();
    const count = async (id) => (await (await page.request.get(`${origin}/api/albums/${id}`)).json()).photos.length;
    const pick = async (act) => {
      await page.locator('.lb-bar [data-act=menu]').click();
      await page.locator(`.lb-menu [data-act=menu-${act}]`).click();
      await expect(page.locator('.album-picker .transfer-mode')).toHaveValue(act);
    };
    await pick('copy');
    await page.locator(`.album-picker [data-target="${kyoto.id}"]`).click();
    await expect(page.locator('.toast')).toHaveText('Copied to "Kyoto"');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    expect(await count(kyoto.id)).toBe(1);
    // The same photo again is skipped as a duplicate, reported as batch transfers report it.
    await pick('copy');
    await page.locator(`.album-picker [data-target="${kyoto.id}"]`).click();
    await expect(page.locator('.toast')).toHaveText('0 items transferred · 1 duplicates skipped');
    // Moving into a new album: the viewer goes on to the next item.
    await pick('move');
    await page.locator('.album-picker [data-action=new]').click();
    await page.locator('dialog.dlg input').fill('Nara');
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.toast')).toHaveText('Moved to "Nara"');
    await expect(page.locator('.lb-count')).toHaveText('1 / 1');
    await expect(page.locator('.lb-filmstrip [aria-current=true]')).toHaveAccessibleName(/clip.mp4/);
    expect(await count(album.id)).toBe(1);
    // Moving the last item from the viewer over the 3D book closes both and leaves an empty album.
    await page.goto(`${origin}/#/a/${album.id}/3d/p/${album.photos[1].id}`);
    await expect(page.locator('.ab canvas')).toBeVisible();
    await expect(page.locator('.lb')).toBeVisible();
    await pick('move');
    await page.locator(`.album-picker [data-target="${kyoto.id}"]`).click();
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.ab')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`#/a/${album.id}$`));
    await expect(page.locator('.album-page .drop')).toBeVisible();
    expect(await count(kyoto.id)).toBe(2);
  } finally { await fixture.close(); }
});

test('switching the album picker from Copy to Move still asks before an unsaved note is lost', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    await toPhone(page, 860, 800);
    const kyoto = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Kyoto' } })).json();
    const count = async (id) => (await (await page.request.get(`${origin}/api/albums/${id}`)).json()).photos.length;
    await page.locator('.lb-bar [data-act=details]').click();
    await page.locator('[data-note-edit]').click();
    const input = page.getByLabel('Note text', { exact: true });
    await input.fill('Unsaved draft');
    const asked = [];
    const moveFromCopy = async (answer) => {
      await page.locator('.lb-bar [data-act=menu]').click();
      await page.locator('.lb-menu [data-act=menu-copy]').click();
      await page.locator('.album-picker .transfer-mode').selectOption('move');
      page.once('dialog', (dialog) => { asked.push(dialog.message()); return dialog[answer](); });
      await page.locator(`.album-picker [data-target="${kyoto.id}"]`).click();
      await expect(page.locator('.album-picker')).toHaveCount(0);
    };
    // Keep the draft: nothing moves.
    await moveFromCopy('dismiss');
    await expect.poll(() => asked.length).toBe(1);
    await expect(input).toHaveValue('Unsaved draft');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    expect(await count(kyoto.id)).toBe(0);
    // Discard it: the move goes ahead.
    await moveFromCopy('accept');
    await expect(page.locator('.toast')).toHaveText('Moved to "Kyoto"');
    expect(asked).toHaveLength(2);
    await expect(page.locator('.lb-count')).toHaveText('1 / 1');
    expect(await count(kyoto.id)).toBe(1);
    expect(await count(album.id)).toBe(1);
  } finally { await fixture.close(); }
});

test('copy and move wait for an import to finish', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    await page.setViewportSize({ width: 860, height: 800 });
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    try {
      await page.locator('.lb-bar [data-act=menu]').click();
      await page.locator('.lb-menu [data-act=menu-move]').click();
      await expect(page.locator('.toast')).toHaveText('Please wait for the current operation to finish.');
      await expect(page.locator('.album-picker')).toHaveCount(0);
    } finally {
      // Quitting waits for imports to finish, so end the pretend one.
      await page.evaluate(() => document.documentElement.removeAttribute('data-busy'));
    }
  } finally { await fixture.close(); }
});

test('a read-only license disables setting the cover, copying and moving in More', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const { page } = await open(fixture);
    await page.setViewportSize({ width: 860, height: 800 });
    await page.locator('.lb-bar [data-act=menu]').click();
    for (const act of ['cover', 'copy', 'move']) await expect(page.locator(`.lb-menu [data-act=menu-${act}]`)).toHaveAttribute('aria-disabled', 'true');
    await page.locator('.lb-menu [data-act=menu-copy]').dispatchEvent('click');
    await expect(page.locator('.album-picker')).toHaveCount(0);
  } finally { await fixture.close(); }
});
