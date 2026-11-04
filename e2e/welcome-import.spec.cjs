const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { openWall, seed } = require('./ui-helpers.cjs');
const { nativeVideo } = require('../tests/fixtures/video.cjs');
const { dropFiles, jpeg } = require('./drop-helpers.cjs');
const { join } = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');

test('the app opens on the album wall, and old or unknown addresses lead there too', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page).toHaveURL(`${origin}/#/albums`);
    await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');
    for (const address of ['/#/', '/#/home', '/#/a/not-an-album', '/']) {
      await page.goto(`${origin}${address}`);
      await expect(page).toHaveURL(`${origin}/#/albums`);
      await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');
    }
    // A phone's link carries its key in the query; rewriting the hash must keep it.
    await page.goto(`${origin}/?key=kept#/`);
    await expect(page).toHaveURL(`${origin}/?key=kept#/albums`);
  } finally { await fixture.close(); }
});

test('an empty library shows the welcome page and creates the first album from it', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const welcome = page.locator('.welcome');
    await expect(welcome).toBeVisible();
    await expect(welcome.locator('h2')).toHaveText('Welcome to Folio');
    await expect(welcome.locator('.welcome-lead')).toHaveText('Photos stay on this computer and are never uploaded to the cloud. Start by adding a few.');
    await expect(welcome.locator('.welcome-formats')).toContainText('MP4, MOV and M4V');
    await expect(page.locator('.wall-search')).toBeHidden();
    await expect(page.locator('.wall-sort')).toBeHidden();
    await expect(page.locator('.page > .ph .sub')).toBeHidden();
    await expect(page.locator('.welcome-trash')).toBeHidden();
    await welcome.locator('[data-act=new]').click();
    await page.locator('dialog.dlg input').fill('First album');
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page).toHaveURL(/#\/a\/[0-9a-f-]{36}$/);
    await expect(page.locator('.album-page .title')).toHaveText('First album');
    await page.goto(`${new URL(page.url()).origin}/#/albums`);
    await expect(page.locator('.folder')).toHaveCount(1);
    await expect(welcome).toBeHidden();
    await expect(page.locator('.wall-search')).toBeVisible();
  } finally { await fixture.close(); }
});

test('the welcome page links to Recently Deleted while it holds something', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Gone' } })).json();
    expect((await page.request.delete(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.welcome')).toBeVisible();
    await expect(page.locator('.folders .trash-card')).toHaveCount(0);
    const link = page.locator('.welcome-trash');
    await expect(link).toHaveText('Recently Deleted · 1 item · Cleared after 30 days');
    await link.click();
    await expect(page).toHaveURL(/#\/trash$/);
  } finally { await fixture.close(); }
});

test('a folder dropped on an album adds what is inside at any depth; hidden files are ignored, others counted', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Trip', 0);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.album-page .drop')).toBeVisible();
    await dropFiles(page, [
      { name: 'Day 1', children: [
        { name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(40) },
        { name: '.DS_Store', bytes: Buffer.from('junk') },
        { name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('hello') },
        { name: '.thumbnails', children: [{ name: 't.jpg', type: 'image/jpeg', bytes: await jpeg(41) }] },
        { name: 'more', children: [
          { name: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(42) },
          { name: 'c.jpg', type: 'image/jpeg', bytes: await jpeg(43) },
          { name: 'moved.jpg', type: 'image/jpeg', unreadable: true },
        ] },
      ] },
      { name: 'loose.jpg', type: 'image/jpeg', bytes: await jpeg(44) },
    ]);
    await expect(page.locator('.tile')).toHaveCount(4);
    await expect(page.locator('.upload small')).toHaveText("Imported 4 items, skipped 1 file that isn't a photo or video, 1 failed · 1 file could not be read");
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    // A folder with nothing to import says so and adds nothing.
    await dropFiles(page, [{ name: 'Receipts', children: [
      { name: '.DS_Store', bytes: Buffer.from('junk') },
      { name: 'r.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF') },
    ] }]);
    await expect(page.locator('.toast')).toHaveText('"Receipts" has no photos or videos');
    expect((await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).photos).toHaveLength(4);
  } finally { await fixture.close(); }
});

// A folder on disk: { 'a.jpg': Buffer, 'more/b.jpg': Buffer, ... } under fixture.root/name.
async function folderOnDisk(fixture, name, files) {
  const dir = join(fixture.root, name);
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
  return dir;
}

test('Import from folder on the welcome page makes an album named after the folder', async () => {
  const fixture = await desktopFixture();
  try {
    const dir = await folderOnDisk(fixture, 'Summer by the sea', {
      'a.jpg': await jpeg(50), 'more/b.jpg': await jpeg(51), '.thumbnails/t.jpg': await jpeg(52), '.DS_Store': 'junk', 'list.txt': 'notes',
    });
    const { page } = await fixture.launch();
    const button = page.locator('.welcome [data-act=import-folder]');
    await expect(button).toHaveText('Import from folder…');
    const chooser = page.waitForEvent('filechooser');
    await button.click();
    await (await chooser).setFiles(dir);
    await expect(page.locator('.folder h3')).toHaveText('Summer by the sea');
    await expect(page.locator('.folder .n')).toHaveText('2 photos');
    await expect(page.locator('.toast')).toHaveText("Imported 2 items, skipped 1 file that isn't a photo or video");
    await expect(page.locator('.upload')).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
  } finally { await fixture.close(); }
});

test('while a folder imports, the wall stays open, other changes wait and another folder joins the run', async () => {
  const fixture = await desktopFixture();
  let release = () => {};
  try {
    const kyoto = await folderOnDisk(fixture, 'Kyoto', { 'k0.jpg': await jpeg(60), 'k1.jpg': await jpeg(61) });
    const nara = await folderOnDisk(fixture, 'Nara', { 'n0.jpg': await jpeg(62) });
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const held = new Promise((resolve) => { release = resolve; });
    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      if (route.request().method() === 'POST') { entered(); await held; }
      await route.continue();
    });
    await page.locator('.folder-input').setInputFiles(kyoto);
    await started;
    await expect(page.locator('.upload b')).toHaveText('Importing "Kyoto" · 1/2');
    await page.evaluate(() => { location.hash = '#/trash'; });
    await expect(page.locator('.toast')).toHaveText('Please wait for the current operation to finish.');
    await expect(page).toHaveURL(`${origin}/#/albums`);
    await page.locator('.page > .ph [data-act=new]').click();
    await expect(page.locator('dialog.dlg')).toHaveCount(0);
    await page.locator('.folder-input').setInputFiles(nara);
    release();
    await expect(page.locator('.toast')).toHaveText('Imported 3 items');
    expect((await page.locator('.folder h3').allTextContents()).sort()).toEqual(['Kyoto', 'Nara']);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await page.evaluate(() => { location.hash = '#/trash'; });
    await expect(page).toHaveURL(`${origin}/#/trash`);
  } finally {
    release(); // quitting waits for the import, so never leave the upload held
    await fixture.close();
  }
});

test('a read-only license imports no folder', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const dir = await folderOnDisk(fixture, 'Locked', { 'a.jpg': await jpeg(70) });
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.welcome [data-act=import-folder]')).toHaveAttribute('aria-disabled', 'true');
    // As if the license ran out while the folder dialog was open.
    await page.locator('.folder-input').setInputFiles(dir);
    await expect(page.locator('.toast')).toHaveText(/^Read-only mode/);
    expect(await (await page.request.get(`${origin}/api/albums`)).json()).toEqual([]);
  } finally { await fixture.close(); }
});

test('folders dropped on the wall become albums one after another; an empty one gets none', async () => {
  const fixture = await desktopFixture();
  let release = () => {};
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await seed(page, origin, 'Existing', 1);
    await openWall(page, origin);
    await expect(page.locator('.folder')).toHaveCount(1);
    // Hovering shows the whole-page hint, which goes once the drag leaves.
    expect((await dropFiles(page, [{ name: 'Summer', children: [] }], { drop: false })).hint).toBe(true);
    await expect(page.locator('.drop-hint')).toBeHidden();
    const held = new Promise((resolve) => { release = resolve; });
    let posts = 0;
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      if (route.request().method() === 'POST' && ++posts === 1) await held;
      await route.continue();
    });
    const long = '海'.repeat(60);
    await dropFiles(page, [
      { name: `  ${long} `, children: [
        { name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(80) },
        { name: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(81) },
        { name: 'clip.mov', type: 'video/quicktime', bytes: await nativeVideo('h264-aac.mov') },
      ] },
      { name: 'Empty', children: [{ name: '.DS_Store', bytes: Buffer.from('junk') }] },
      { name: '   ', children: [{ name: 'c.jpg', type: 'image/jpeg', bytes: await jpeg(82) }] },
    ]);
    await expect(page.locator('.toast')).toHaveText('"Empty" has no photos or videos');
    await expect(page.locator('.upload b')).toHaveText(`Importing "${'海'.repeat(50)}" · 1/3`);
    // New cards come with the summary, not as empty cards while their photos are still coming in.
    await page.waitForTimeout(500);
    expect(await page.locator('.folder').count()).toBe(1);
    release();
    await expect(page.locator('.toast')).toHaveText('Imported 4 items');
    expect((await page.locator('.folder h3').allTextContents()).sort()).toEqual(['Existing', 'New album', '海'.repeat(50)].sort());
    await expect(page.locator('.folder', { hasText: '海'.repeat(50) }).locator('.n')).toHaveText('2 photos · 1 video');
  } finally {
    release(); // quitting waits for the import, so never leave the upload held
    await fixture.close();
  }
});

test('an album that cannot be created stops only its own folder', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    let refused = false;
    await page.route(`${origin}/api/albums`, async (route) => {
      if (route.request().method() !== 'POST' || refused) return route.continue();
      refused = true;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Disk full' }) });
    });
    await dropFiles(page, [
      { name: 'First', children: [{ name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(90) }, { name: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(91) }] },
      { name: 'Second', children: [{ name: 'c.jpg', type: 'image/jpeg', bytes: await jpeg(92) }] },
    ]);
    await expect(page.locator('.toast')).toHaveText('Imported 1 item, 2 failed · Couldn\'t create "First": Disk full');
    await expect(page.locator('.folder h3')).toHaveText(['Second']);
  } finally { await fixture.close(); }
});

test('loose photos dropped on the wall get a new album named first; cancelling imports nothing', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.welcome .welcome-drop')).toHaveText('Drop photos or folders here');
    const drop = async () => dropFiles(page, [
      { name: 'x.jpg', type: 'image/jpeg', bytes: await jpeg(100) },
      { name: 'y.jpg', type: 'image/jpeg', bytes: await jpeg(101) },
      { name: 'Folder', children: [{ name: 'z.jpg', type: 'image/jpeg', bytes: await jpeg(102) }] },
    ]);
    const dialog = page.locator('dialog.dlg');
    await drop();
    await expect(dialog.locator('h3')).toHaveText('New album');
    await expect(dialog.locator('.dlg-text')).toHaveText('Put these 2 items in a new album');
    await dialog.locator('[data-act=cancel]').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.welcome')).toBeVisible();
    expect(await (await page.request.get(`${origin}/api/albums`)).json()).toEqual([]);
    await drop();
    await dialog.locator('input').fill('Beach day');
    await dialog.locator('[value=ok]').click();
    await expect(page.locator('.toast')).toHaveText('Imported 3 items');
    expect((await page.locator('.folder h3').allTextContents()).sort()).toEqual(['Beach day', 'Folder']);
  } finally { await fixture.close(); }
});

test('a read-only license takes no drop on the wall', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await dropFiles(page, [{ name: 'Locked', children: [{ name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(110) }] }]);
    await expect(page.locator('.toast')).toHaveText(/^Read-only mode/);
    expect(await (await page.request.get(`${origin}/api/albums`)).json()).toEqual([]);
  } finally { await fixture.close(); }
});
