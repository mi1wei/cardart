const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { openSettings, seed } = require('./ui-helpers.cjs');

test('Settings holds appearance, language and the license in one dialog', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    let settings = await openSettings(page);
    await expect(settings.locator('h3')).toHaveText('Settings');
    await expect(settings.locator('[data-theme-mode]')).toHaveText(['Light', 'Dark', 'Auto']);
    await expect(settings.locator('[data-lang]')).toHaveText(['中文', 'English']);
    await expect(settings.locator('[data-lang=en]')).toHaveAttribute('aria-pressed', 'true');
    await expect(settings.locator('.set-license')).toHaveText('Trial active');
    await expect(settings.locator('.set-expiry')).toContainText('Valid until');
    await settings.locator('[data-theme-mode=dark]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settings.locator('[data-lang=zh]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(settings.locator('h3')).toHaveText('设置');
    await expect(settings.locator('[data-theme-mode=dark]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.page > .ph .t1')).toHaveText('相册');
    await settings.locator('[data-act=done]').click();
    await expect(page.locator('dialog.settings')).toHaveCount(0);
    await openSettings(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.settings')).toHaveCount(0);
    // A 320px phone: every row wraps inside the dialog, in both languages.
    await page.setViewportSize({ width: 320, height: 700 });
    for (const code of ['zh', 'en']) {
      settings = await openSettings(page);
      await settings.locator(`[data-lang=${code}]`).click();
      expect(await settings.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await settings.locator('[data-act=done]').click();
    }
  } finally { await fixture.close(); }
});

test('Manage waits for an import to finish, then opens the license page', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    const settings = await openSettings(page);
    await expect(settings.locator('[data-lang=zh]')).toBeDisabled();
    await expect(settings.locator('.set-note')).toHaveText('Available after the import finishes');
    await expect(settings.locator('[data-act=license]')).toHaveAttribute('aria-disabled', 'true');
    await settings.locator('[data-act=license]').dispatchEvent('click');
    await expect(page.locator('.toast')).toHaveText('Wait for the current import to finish before managing the license.');
    await expect(page).toHaveURL(/#\/albums$/);
    // The import ends while Settings is still open.
    await page.evaluate(() => document.documentElement.removeAttribute('data-busy'));
    await expect(settings.locator('[data-lang=zh]')).toBeEnabled();
    await expect(settings.locator('.set-note')).toBeHidden();
    await settings.locator('[data-act=license]').click();
    await expect(page).toHaveURL(/#\/license$/);
    await expect(page.locator('dialog.settings')).toHaveCount(0);
    await expect(page.locator('.license-page')).toBeVisible();
  } finally { await fixture.close(); }
});

test('the top bar keeps the logo, phone access and Settings, and every page leads back to the albums', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.nav .logo')).toHaveAttribute('href', '#/albums');
    await expect(page.locator('.nav .nl, .nav .theme, .nav .lang')).toHaveCount(0);
    await expect(page.locator('.nav [data-act=phone]')).toBeVisible();
    await expect(page.locator('.nav [data-act=settings]')).toHaveAccessibleName('Settings');
    const album = await seed(page, origin, 'Way back', 1);
    for (const hash of [`#/a/${album.id}`, '#/trash', '#/license']) {
      await page.goto(`${origin}/${hash}`);
      const back = page.locator('main .back-link');
      await expect(back).toHaveText('All albums');
      await back.click();
      await expect(page).toHaveURL(/#\/albums$/);
    }
  } finally { await fixture.close(); }
});
