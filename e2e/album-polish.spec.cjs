const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const sharp = require('sharp');
const { seed, setRange } = require('./ui-helpers.cjs');

test('photos get a frame and the thumbnail size is remembered', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Frames', 3);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(3);
    expect(await page.locator('.tile').first().evaluate((el) => getComputedStyle(el).boxShadow)).toContain('0px 0px 0px 4px');
    const row = () => page.locator('.grid').evaluate((el) => getComputedStyle(el).getPropertyValue('--row').trim());
    expect(await row()).toBe('180px');
    await setRange(page.locator('.density input'), '0');
    await expect.poll(row).toBe('120px');
    await setRange(page.locator('.density input'), '2');
    await expect.poll(row).toBe('260px');
    await page.reload();
    await expect(page.locator('.tile')).toHaveCount(3);
    expect(await row()).toBe('260px');
    await expect(page.locator('.density input')).toHaveValue('2');
  } finally { await fixture.close(); }
});

test('loading shows placeholders instead of the empty drop zone', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Slow', 1);
    let release;
    let held = new Promise((resolve) => { release = resolve; });
    const albumRoute = new RegExp(`/api/albums/${album.id}$`);
    await page.route(albumRoute, async (route) => { await held; await route.continue(); });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.grid .skel').first()).toBeVisible();
    await expect(page.locator('.album-page .drop')).toBeHidden();
    release();
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.grid .skel')).toHaveCount(0);
    await page.unroute(albumRoute);

    held = new Promise((resolve) => { release = resolve; });
    await page.route(/\/api\/albums$/, async (route) => { await held; await route.continue(); });
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.folder-skel').first()).toBeVisible();
    await expect(page.locator('.folder')).toHaveCount(0);
    release();
    await expect(page.locator('.folder')).toHaveCount(1);
    await expect(page.locator('.folder-skel')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('cards, breadcrumb, select icon, lightbox brand and home show the polished details', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const full = await seed(page, origin, 'Full', 2);
    const empty = await seed(page, origin, 'Empty', 0);
    await page.goto(`${origin}/#/albums`);
    await page.locator('.nav [data-lang=zh]').click();
    await expect(page.locator(`.folder[data-id="${full.id}"] .n`)).toHaveText('2 张照片');
    await expect(page.locator(`.folder[data-id="${empty.id}"] .n`)).toHaveText('还没有照片');

    await page.goto(`${origin}/#/`);
    await expect(page.locator('.recent')).toBeVisible();
    await expect(page.locator('.recent .folder')).toHaveCount(1);
    await expect(page.locator(`.recent .folder[data-id="${full.id}"]`)).toHaveCount(1);

    await page.goto(`${origin}/#/a/${full.id}`);
    await expect(page.locator('.crumb .crumb-here')).toHaveText('Full');
    await expect(page.locator('.acts.normal [data-act=select] svg')).toHaveCount(1);
    await page.locator('.acts.normal [data-act=menu]').click();
    await page.locator('.acts .menu [data-act=rename]').click();
    await page.locator('dialog.dlg input').fill('Full renamed');
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.crumb .crumb-here')).toHaveText('Full renamed');
    await expect(page.locator('.acts .menu')).toHaveCount(0);

    await page.locator('.tile').first().click();
    await expect(page.locator('.lb-brand')).toContainText('Folio');
    await expect(page.locator('.lb-fit')).toHaveCount(0);
    await page.goto(`${origin}/#/a/${full.id}`);
    await expect(page.locator('.lb')).toHaveCount(0);

    await page.locator('.acts.normal [data-act=menu]').click();
    await page.locator('.acts .menu [data-act=delete-album]').click();
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page).toHaveURL(/#\/albums$/);
    await expect(page.locator(`.folder[data-id="${full.id}"]`)).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('deleting the album from ⋯ during an import is refused', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Busy', 1);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => { entered(); await held; await route.continue(); });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    const jpeg = await sharp({ create: { width: 50, height: 20, channels: 3, background: '#2f6aa3' } }).jpeg().toBuffer();
    await page.locator('.album-page input[type=file]').setInputFiles([{ name: 'new.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
    await started;
    await page.locator('.acts.normal [data-act=menu]').click();
    await page.locator('.acts .menu [data-act=delete-album]').click();
    await expect(page.locator('.toast')).toHaveText(/请等待当前导入完成|Please wait for the import/);
    await expect(page.locator('dialog.dlg')).toHaveCount(0);
    release();
    await expect(page.locator('.tile')).toHaveCount(2);
    expect((await page.request.get(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
  } finally { await fixture.close(); }
});

test('narrow album cards keep the title readable next to the full count', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await seed(page, origin, 'Summer trip to Kyoto with the whole family', 5);
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.folder .n')).toHaveText('5 photos');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const sizes = await page.locator('.folder').first().evaluate((card) => {
        const box = (sel) => card.querySelector(sel);
        return {
          title: box('h3').clientWidth, titleFull: box('h3').scrollWidth,
          count: box('.n').clientWidth, countFull: box('.n').scrollWidth, meta: box('.meta').clientWidth,
          gap: box('.n').getBoundingClientRect().top - box('h3').getBoundingClientRect().bottom,
        };
      });
      expect(sizes.title, `title at ${width}px`).toBeGreaterThanOrEqual(Math.min(sizes.titleFull, sizes.meta * 0.6));
      expect(sizes.count, `count at ${width}px`).toBeGreaterThanOrEqual(sizes.countFull);
      expect(sizes.gap, `count right under the title at ${width}px`).toBeLessThan(6);
    }
  } finally { await fixture.close(); }
});

test('an import started while the delete-album confirmation is open still blocks the delete', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Racing', 1);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => { entered(); await held; await route.continue(); });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    await page.locator('.acts.normal [data-act=menu]').click();
    await page.locator('.acts .menu [data-act=delete-album]').click();
    await expect(page.locator('dialog.dlg')).toBeVisible();
    const jpeg = await sharp({ create: { width: 50, height: 20, channels: 3, background: '#2f6aa3' } }).jpeg().toBuffer();
    await page.locator('.album-page input[type=file]').setInputFiles([{ name: 'late.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
    await started;
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.toast')).toHaveText(/Please wait for the import|请等待当前导入完成/);
    expect((await page.request.get(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
    release();
    await expect(page.locator('.tile')).toHaveCount(2);
  } finally { await fixture.close(); }
});

test('in Chinese the app keeps the name Folio in the nav, titles, viewer and phone tips', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, '旅行', 1);
    await page.goto(`${origin}/#/albums`);
    await page.locator('.nav [data-lang=zh]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('.nav')).toHaveAccessibleName('Folio');
    await expect(page.locator('.nav .logo')).toHaveAccessibleName('Folio');
    await expect(page).toHaveTitle('相册 · Folio');
    await expect(page.locator('meta[name=apple-mobile-web-app-title]')).toHaveAttribute('content', 'Folio');
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page).toHaveTitle('旅行 · Folio');
    await page.locator('.tile').first().click();
    await expect(page.locator('.lb-brand')).toHaveText('Folio');
    await page.goto(`${origin}/#/`);
    await expect(page).toHaveTitle('Folio');
    await page.locator('.nav [data-act=phone]').click();
    await expect(page.locator('dialog[open] .note')).toContainText('「Folio」');
    // 「相册页」 means "album page"; only the old app name 册页 must be gone.
    expect(await page.evaluate(() => /(?<!相)册页/.test(document.body.innerText))).toBe(false);
  } finally { await fixture.close(); }
});
