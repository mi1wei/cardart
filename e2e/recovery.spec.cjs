const { test, expect } = require('@playwright/test');
const { readFile, utimes } = require('node:fs/promises');
const { join } = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { desktopFixture } = require('./fixtures.cjs');
const { setLang } = require('./ui-helpers.cjs');
const run = promisify(execFile);

test('port fallback after restart preserves English, albums and activation without using the foreign listener', async () => {
  const fixture = await desktopFixture();
  const occupied = http.createServer((req, res) => res.end('foreign service'));
  try {
    const first = await fixture.launch();
    const origin = new URL(first.page.url()).origin;
    await setLang(first.page, 'zh');
    await setLang(first.page, 'en');
    await expect(first.page.locator('html')).toHaveAttribute('lang', 'en');
    const album = await (await first.page.request.post(`${origin}/api/albums`, { data: { title: 'Kept after restart' } })).json();
    await fixture.stop();
    await new Promise((resolve, reject) => {
      occupied.once('error', reject);
      occupied.listen(Number(new URL(origin).port), '0.0.0.0', resolve);
    });
    const { desktop, page } = await fixture.launch();
    const changed = new URL(page.url()).origin;
    expect(changed).not.toBe(origin);
    expect(await (await fetch(origin)).text()).toBe('foreign service');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');
    expect(await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('license').label)).toBe('License…');
    expect(await desktop.evaluate(() => global.folioTestNotices.length)).toBeGreaterThan(0);
    const albums = await (await page.request.get(`${changed}/api/albums`)).json();
    expect(albums.map((item) => item.id)).toContain(album.id);
    expect((await (await page.request.get(`${changed}/api/license`)).json()).canWrite).toBe(true);
    const phone = await (await page.request.get(`${changed}/api/phone`)).json();
    expect(phone.port).toBe(Number(new URL(changed).port));
  } finally {
    await fixture.close();
    if (occupied.listening) await new Promise((resolve) => occupied.close(resolve));
  }
});

test('a second desktop reopens the existing window while a CLI writer is rejected', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const before = JSON.parse(await readFile(join(fixture.profile, 'runtime.json'), 'utf8'));
    await desktop.evaluate(() => global.folioTestDesktop.window.close());
    await run(require('electron'), [join(__dirname, 'desktop-entry.cjs'), `--user-data-dir=${fixture.profile}`], {
      env: { ...process.env, ALBUM_LIBRARY: fixture.library, FOLIO_E2E_KEY_FILE: fixture.keyFile }, timeout: 15000,
    });

    await expect.poll(() => desktop.evaluate(() => global.folioTestDesktop.window.isVisible())).toBe(true);
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(JSON.parse(await readFile(join(fixture.profile, 'runtime.json'), 'utf8')).servicePid).toBe(before.servicePid);
    await expect(run(process.execPath, [join(__dirname, '../server/index.js')], {
      env: { ...process.env, ALBUM_LIBRARY: fixture.library }, timeout: 15000,
    })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('LIBRARY_IN_USE') });
    expect((await page.request.get(`${before.origin}/api/albums`)).status()).toBe(200);
  } finally { await fixture.close(); }
});

test('a profile-scoped quit command exits the running desktop through its normal drain path', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const closed = desktop.waitForEvent('close', { timeout: 5000 });
    await run(require('electron'), [join(__dirname, 'desktop-entry.cjs'), `--user-data-dir=${fixture.profile}`, '--quit'], {
      env: { ...process.env, ALBUM_LIBRARY: fixture.library, FOLIO_E2E_KEY_FILE: fixture.keyFile }, timeout: 15000,
    });
    await closed;
    await expect(readFile(join(fixture.profile, 'runtime.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fetch(origin)).rejects.toThrow();
    const { openLibrary } = await import('../server/library.js');
    const lib = await openLibrary(fixture.library);
    await lib.close();
  } finally { await fixture.close(); }
});

test('an unexpected utility crash exits cleanly and only stale owned locks can be recovered', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const runtime = JSON.parse(await readFile(join(fixture.profile, 'runtime.json'), 'utf8'));
    const album = await (await page.request.post(`${runtime.origin}/api/albums`, { data: { title: 'Crash survivor' } })).json();
    await desktop.evaluate(({ dialog }) => { dialog.showErrorBox = () => {}; });
    const closed = desktop.waitForEvent('close');
    process.kill(runtime.servicePid, 'SIGKILL');
    await closed;
    await expect.poll(async () => fetch(runtime.origin).then(() => false, () => true)).toBe(true);
    expect(await readFile(join(fixture.profile, 'logs/desktop.log'), 'utf8')).toMatch(/BACKEND_(EXIT|CRASH)/);
    const { openLibrary } = await import('../server/library.js');
    await expect(openLibrary(fixture.library)).rejects.toMatchObject({ code: 'LIBRARY_IN_USE' });
    const past = new Date(Date.now() - 125000);
    await utimes(join(fixture.library, '.folio.lock'), past, past);
    const recovered = await openLibrary(fixture.library);
    try { expect(recovered.get(album.id).title).toBe('Crash survivor'); }
    finally { await recovered.close(); }
  } finally { await fixture.close(); }
});
