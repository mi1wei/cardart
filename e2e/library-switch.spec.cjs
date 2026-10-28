const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');

async function chooseLibrary(desktop, dir) {
  return desktop.evaluate(({ dialog, Menu }, path) => new Promise((resolve) => {
    const contents = global.folioTestDesktop.window.webContents;
    const finish = (result) => { contents.removeListener('did-finish-load', loaded); resolve(result); };
    const loaded = () => finish('loaded');
    contents.once('did-finish-load', loaded);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    const showMessageBox = dialog.showMessageBox;
    dialog.showMessageBox = async (...args) => {
      if (/导入完成|import to finish/.test(args.at(-1).message)) finish('busy');
      return showMessageBox(...args);
    };
    dialog.showErrorBox = (title, message) => { global.folioTestSwitchError = message; finish('error'); };
    const item = Menu.getApplicationMenu().items[0].submenu.items.find((item) => /选择相册库|Choose Library/.test(item.label));
    item.click();
  }), dir);
}

test('choosing another library during an active upload preserves the current view and every queued file', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const before = JSON.parse(await readFile(join(fixture.profile, 'desktop.json'), 'utf8'));
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Do not discard' } })).json();
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.album-page .title')).toHaveText('Do not discard');
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'false');
    let first = true;
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      if (first) { first = false; entered(); await held; }
      await route.continue();
    });
    await page.locator('.album-page input[type=file]').setInputFiles(await Promise.all(['#d32f2f', '#1d5f80'].map(async (background, index) => ({
      name: `queued-${index}.png`, mimeType: 'image/png',
      buffer: await sharp({ create: { width: 8, height: 6, channels: 3, background } }).png().toBuffer(),
    }))));
    await started;
    await chooseLibrary(desktop, join(fixture.root, 'Other library'));
    await expect(page.locator('.album-page')).toBeVisible();
    expect(JSON.parse(await readFile(join(fixture.profile, 'desktop.json'), 'utf8')).libraryDir).toBe(before.libraryDir);
    release();
    await expect(page.locator('.tile')).toHaveCount(2);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
  } finally { release(); await fixture.close(); }
});

test('a failed runtime-state save stops the candidate service before restoring the previous library', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch({ args: ['--fixture-runtime-save-failure'] });
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Original library' } })).json();
    await desktop.evaluate(() => { global.folioTestFailNextRuntimeSave = true; });
    const other = join(fixture.root, 'Failed candidate library');
    await chooseLibrary(desktop, other);
    const { openLibrary } = await import('../server/library.js');
    const candidate = await openLibrary(other);
    await candidate.close();
    const runtime = JSON.parse(await readFile(join(fixture.profile, 'runtime.json'), 'utf8'));
    expect(new URL(page.url()).origin).toBe(runtime.origin);
    expect((await (await page.request.get(`${runtime.origin}/api/albums`)).json()).map((value) => value.id)).toContain(album.id);
    await expect.poll(() => desktop.evaluate(() => global.folioTestSwitchError || '')).toContain('Owned runtime persistence failure');
  } finally { await fixture.close(); }
});

test('a failed switch and failed rollback stop both owned services before the user-confirmed exit', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop } = await fixture.launch({ args: ['--fixture-runtime-save-failure'] });
    await desktop.evaluate(({ dialog }) => {
      global.folioTestRuntimeSaveFailures = 2;
      dialog.showMessageBox = async () => ({ response: 0 });
    });
    const other = join(fixture.root, 'Failed rollback library');
    const closed = desktop.waitForEvent('close', { timeout: 5000 });
    const selecting = chooseLibrary(desktop, other).catch(() => {});
    await closed;
    await selecting;
    const { openLibrary } = await import('../server/library.js');
    for (const dir of [fixture.library, other]) {
      const lib = await openLibrary(dir);
      await lib.close();
    }
  } finally { await fixture.close(); }
});
