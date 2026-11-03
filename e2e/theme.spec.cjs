const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, style } = require('./ui-helpers.cjs');

test('the dark palette covers page surfaces and the lightbox stays dark', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Dark check', 1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    expect(await style(page, 'body', 'backgroundColor')).toBe('rgb(18, 20, 23)');
    expect(await style(page, '.acts.normal .btn.pri', 'color')).toBe('rgb(15, 26, 32)');
    expect(await style(page, '.tile .badge', 'color')).toBe('rgb(28, 36, 48)');
    expect(await style(page, '.tile', 'backgroundColor')).toBe('rgb(34, 38, 43)');
    await page.locator('.album-page .title').click();
    await expect(page.locator('dialog.dlg')).toBeVisible();
    expect(await style(page, 'dialog.dlg', 'backgroundColor')).toBe('rgb(26, 29, 33)');
    await page.keyboard.press('Escape');
    await page.locator('.tile').click();
    await expect(page.locator('.lb')).toBeVisible();
    expect(await style(page, '.lb', 'backgroundColor')).toBe('rgb(13, 15, 17)');
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.folder')).toHaveCount(1);
    expect(await style(page, '.folder .pocket .back', 'backgroundImage')).toContain('rgb(38, 42, 47)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await style(page, 'body', 'backgroundColor')).toBe('rgb(247, 249, 251)');
  } finally { await fixture.close(); }
});

const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('auto follows the system and a manual choice survives a reload', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.theme [data-theme-mode=auto]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => bg(page)).toBe('rgb(247, 249, 251)');
    await page.locator('.theme [data-theme-mode=dark]').click();
    await expect(page.locator('.theme [data-theme-mode=dark]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    expect(await page.locator('head script[src="/theme-boot.js"]').count()).toBe(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    await page.locator('.theme [data-theme-mode=auto]').click();
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
    await expect.poll(() => bg(page)).toBe('rgb(247, 249, 251)');
  } finally { await fixture.close(); }
});

test('theme can change during an import while the language cannot', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/#/albums`);
    await page.locator('.nav [data-lang=zh]').click();
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    try {
      await page.locator('.theme [data-theme-mode=dark]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.locator('.nav [data-lang=en]').dispatchEvent('click');
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    } finally {
      await page.evaluate(() => document.documentElement.removeAttribute('data-busy'));
    }
  } finally { await fixture.close(); }
});

test('without light-dark support the switch is hidden and the page stays light', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) => (args.join(' ').includes('light-dark') ? false : supports(...args));
    });
    await page.goto(`${origin}/#/albums`);
    await page.reload();
    await expect(page.locator('.nav .logo')).toBeVisible();
    await expect(page.locator('.theme')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('blocked storage falls back to auto and a choice still applies for this visit', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    });
    await page.goto(`${origin}/#/albums`);
    await page.reload();
    await expect(page.locator('.theme [data-theme-mode=auto]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.theme [data-theme-mode=dark]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
  } finally { await fixture.close(); }
});

async function corner(page) {
  const png = await page.locator('.ab canvas').screenshot();
  const { data } = await sharp(png).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 3)];
}
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);

test('the 3D book background follows the theme while the book is open', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, '3D theme', 2);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab canvas')).toBeVisible();
    await expect.poll(async () => near(await corner(page), [18, 20, 23]), { timeout: 15000 }).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(async () => near(await corner(page), [247, 249, 251]), { timeout: 15000 }).toBe(true);
  } finally { await fixture.close(); }
});

test('the album top bar with the theme switch fits a 320px phone in both languages', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Narrow', 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    await page.setViewportSize({ width: 320, height: 700 });
    for (const lang of ['en', 'zh']) {
      await page.locator(`.nav [data-lang=${lang}]`).click();
      await expect(page.locator('.nav .theme')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('.nav .logo')).toHaveAccessibleName(/册页|Folio/);
    }
  } finally { await fixture.close(); }
});
