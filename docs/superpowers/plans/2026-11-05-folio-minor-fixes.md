# Folio Minor Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 16 minor issues deferred during the S1–S5 reviews, as picked from the comparison doc: 1, 2, 3, 4, 5, 6B and 7–16.

**Architecture:** Each fix stays in the module that owns the behaviour today. The only new unit is `createDropReader(host)` in `src/import-files.js`, shared by the album wall and the album page, fed by a new `onFound` callback on `collectDrop`. Full-screen state joins the existing `folio:desktop:info` reply; no new IPC channel. Items 12 and 14–16 change tests only.

**Tech Stack:** Electron, vanilla JavaScript/CSS, Vite, three.js, Node test runner, Playwright Electron.

**Spec:** the approved comparison doc for the 16 minor issues (session artifact `files/minor-fixes-compare/index.html`, not in the repo), picks “要：1、2、3、4、5、6B、7、8、9、10、11、12、13、14、15、16”. Every task below quotes the behaviour and copy that was approved, so the doc is not needed to execute it.

## Global Constraints

- Copy, exactly:
  - Cover button (item 1): existing keys `set-album-cover` / `already-cover` (“设为相册封面” / “已是封面”, “Set as album cover” / “Already the cover”), image icon.
  - Video details (item 2): zh `暂时无法读取视频详情，仍可尝试播放或下载原视频。`, en `Video details are temporarily unavailable. You can still try playback or download the original video.`
  - Sort (item 4): en `Last updated`; zh `最近更新` unchanged.
  - Reading a drop (item 8): zh `正在读取拖入的文件…`, `已找到 N 个 · 读完后开始导入`, `请等上一批读完`; en `Reading the dropped files…`, `N file(s) found · Import starts when reading is done`, `Please wait until the earlier drop has been read`.
- Title-page small print on the light board (item 10): `#4a5662`.
- Item 3 changes Windows only (≥ 720 px windows); the Mac menu position is unchanged. Item 6B changes phones only (≤ 600 px); computers are unchanged.
- UI text uses the S5 size tokens; radii use the S5 tokens or 50 % circles.
- No new dependencies, no server changes, no new IPC channels; 3D and PDF layouts are unchanged.
- Work in `.worktrees/folio-minor-fixes`, branch `fix/folio-minor-fixes` from `main` `e3d8211`. Open a PR to `main`; do not merge.
- Commands: `npm test` (Node tests); `npm run build` before any `npx playwright test …`, because the Electron tests load `dist/`.

## Review Focus

1. Moving from one card's ⋯ menu to another's while a refresh is waiting keeps the new menu open, and the wall still refreshes once it closes (Task 4 test).
2. A drop of an empty folder, a full folder and a loose non-media file reports the skipped file and gives the empty folder no album (Task 5 test).
3. Dragging over the window while a drop is still being read does not put the drop hint over the reading panel (Task 6 test: hovering a second batch reports `hint: false`).
4. A drop made after reading has finished is imported as usual (Task 6 test).
5. The album page shows the same reading panel and turns away a second drop (Task 6 test).

## Files

| File | Change |
|---|---|
| `src/photo-details.js`, `src/lightbox.js`, `src/ui.js` | Item 1: one cover button style and label |
| `src/i18n.js` | Items 1, 2 and 8 copy |
| `src/style.css` | Item 3 Windows menu rule; item 8 reading panel |
| `src/collection-text.js`, `src/collection.css` | Items 4 and 6B |
| `src/wall.js` | Items 5, 7 and 8 |
| `src/folder-files.js`, `src/import-files.js`, `src/album.js`, `README.md` | Item 8 |
| `desktop/desktop-info.cjs`, `desktop/main.cjs`, `src/desktop.js` | Item 9 |
| `src/book/title-page.js`, `shared/dates.js`, `src/book/book.js` | Items 10, 11 and 13 |
| `e2e/*.spec.cjs`, `e2e/drop-helpers.cjs`, `src/folder-files.test.js`, `shared/dates.test.js`, `desktop/desktop-info.test.cjs` | Tests; items 12, 14, 15 and 16 |

---

### Task 1: The phone cover button and the video-details hint (items 1, 2)

Item 1: the phone Details sheet's cover button uses a star and “设为封面”; the ⋯ menu uses the image icon and “设为相册封面”, and says “已是封面” when greyed out. Make the sheet match. Item 2: the video-details hint names a button that is now called “下载原视频”.

**Files:**
- Modify: `src/photo-details.js:41`, `src/lightbox.js:198`, `src/ui.js:25`, `src/i18n.js:199,213,511,525`
- Test: `e2e/lightbox-v2.spec.cjs:134-148`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test.** In `phone swipes navigate, open the bottom sheet or close…`, after line 135 (`sheet-delete` visible) add:

```js
    // The sheet's cover button reads like the ⋯ menu's, and says why it is greyed out.
    const cover = page.locator('.lb-details [data-act=sheet-cover]');
    await expect(cover).toHaveText('Already the cover');
    await expect(cover).toBeDisabled();
    expect(await cover.locator('svg').innerHTML()).toBe(await page.locator('.lb-menu [data-act=menu-cover] svg').innerHTML());
```

and after line 148 (`await expect(page.locator('.lb-count')).toHaveText('2 / 2');`) add:

```js
    await expect(page.locator('.lb-details [data-act=sheet-cover]')).toHaveText('Set as album cover');
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs -g "phone swipes"`
Expected: FAIL — expected “Already the cover”, received “Set as cover”.

- [ ] **Step 3: Implement.**

`src/photo-details.js:41`: replace `${icon('star')}<span>${t('set-cover')}</span>` with `${icon('image')}<span>${t('set-album-cover')}</span>`.

`src/lightbox.js:198`: replace the line with

```js
      for (const label of root.querySelectorAll('[data-act=sheet-cover] span, [data-act=menu-cover] span')) label.textContent = t(isCover ? 'already-cover' : 'set-album-cover');
```

Delete the now unused `star` icon (`src/ui.js:25`) and both `'set-cover'` entries (`src/i18n.js:213` and `:525`). Then change the hint:

```js
    'video-details-unavailable': '暂时无法读取视频详情，仍可尝试播放或下载原视频。',
```

```js
    'video-details-unavailable': 'Video details are temporarily unavailable. You can still try playback or download the original video.',
```

Check nothing else used them: `grep -rn "icon('star')\|'set-cover'" src` prints nothing.

- [ ] **Step 4: Run the tests.**

Run: `npm test && npm run build && npx playwright test e2e/lightbox-v2.spec.cjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/photo-details.js src/lightbox.js src/ui.js src/i18n.js e2e/lightbox-v2.spec.cjs
git commit -m "fix: match the phone cover button to the viewer menu"
```

### Task 2: The viewer ⋯ menu on Windows (item 3)

On Windows the bar leaves room for the window buttons, so the ⋯ button moves left, but `.lb-menu` keeps `right: 12px` and opens about 150 px to the right, under the window buttons. Align its right edge with the button.

**Files:**
- Modify: `src/style.css:1369-1372` (inside `@media (min-width: 720px)`)
- Test: `e2e/lightbox-v2.spec.cjs` (new test after the phone test)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test.**

```js
test('the ⋯ menu opens under its button when the Windows window buttons push the bar in', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
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
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs -g "Windows window buttons"`
Expected: FAIL — the edges differ by 12 px on a Mac (about 150 px on Windows).

- [ ] **Step 3: Implement.** After the `[data-desktop='win'] :is(.nav, .lb-bar, .ab-bar)` rule, inside the same media query:

```css
  /* The viewer's ⋯ menu lines up with its button, not with the window buttons. */
  [data-desktop='win'] .lb-menu {
    right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 24px);
  }
```

- [ ] **Step 4: Run the test.**

Run: `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/style.css e2e/lightbox-v2.spec.cjs
git commit -m "fix: open the viewer menu under its button on Windows"
```

### Task 3: The English sort choice and the phone trash card (items 4, 6B)

Item 4: at 390 px in English the sort select shows “Recently updat”; use “Last updated”. Item 6B: below 600 px the “Recently Deleted” card takes a whole row, icon on the left and text on the right.

**Files:**
- Modify: `src/collection-text.js:7`, `src/collection.css:145-146`
- Test: `e2e/labels.spec.cjs` (test `sort pickers say what they sort…`), `e2e/collection-v2.spec.cjs` (new test at the end)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests.** At the end of the `try` block of `sort pickers say what they sort and the thumbnail slider shows its range` (after the 320 px loop):

```js
    // A 390px phone in English shows the whole sort choice.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/#/albums`);
    const sort = page.locator('.wall-sort');
    await expect(sort.locator('option:checked')).toHaveText('Last updated');
    const { width, max } = await sort.evaluate((el) => ({ width: el.getBoundingClientRect().width, max: parseFloat(getComputedStyle(el).maxWidth) }));
    expect(width, 'narrower than its cap, so nothing is cut off').toBeLessThan(max);
```

At the end of `e2e/collection-v2.spec.cjs`:

```js
test('on a phone the Recently Deleted card takes a whole row and its text fits on one line', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await seed(page, origin, 'Kept', 1);
    const gone = await seed(page, origin, 'Gone', 1);
    await page.request.delete(`${origin}/api/albums/${gone.id}`);
    await page.setViewportSize({ width: 320, height: 700 });
    await openWall(page, origin);
    const card = page.locator('.trash-card');
    await expect(card).toBeVisible();
    const row = await page.locator('.folders').evaluate((el) => el.getBoundingClientRect().width);
    expect((await card.boundingBox()).width).toBeCloseTo(row, 0);
    const lines = await card.locator('span').evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npm run build && npx playwright test e2e/labels.spec.cjs e2e/collection-v2.spec.cjs -g "sort pickers|Recently Deleted card"`
Expected: FAIL — “Recently updated” instead of “Last updated”; the card is one grid cell (about 139 px) instead of the row (about 288 px).

- [ ] **Step 3: Implement.** `src/collection-text.js:7`: `updated: 'Recently updated'` → `updated: 'Last updated'`. In `src/collection.css`, replace lines 145–146 (inside `@media (max-width: 600px)`) with:

```css
  /* A whole row, the icon beside the text. */
  .trash-card { grid-column: 1 / -1; min-height: 0; display: grid; grid-template-columns: auto 1fr; column-gap: 14px; row-gap: 2px; align-items: center; justify-items: start; padding: 14px 16px; }
  .trash-card svg { grid-row: 1 / 3; width: 28px; height: 28px; }
  .trash-card strong { align-self: end; }
  .trash-card span { align-self: start; text-align: left; font-size: var(--text-12); line-height: var(--leading-12); }
```

- [ ] **Step 4: Run the tests.**

Run: `npm run build && npx playwright test e2e/labels.spec.cjs e2e/collection-v2.spec.cjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/collection-text.js src/collection.css e2e/labels.spec.cjs e2e/collection-v2.spec.cjs
git commit -m "fix: fit the English sort choice and the phone trash card"
```

### Task 4: A card menu survives the refresh on window focus (item 5)

Coming back to the window refreshes the wall, and the redraw closes an open card ⋯ menu. While a card menu is open, keep the result for later and refresh once the menu closes.

**Files:**
- Modify: `src/wall.js:20` (new flag), `:72` (`load`), `:145` (`closeMenu`)
- Test: `e2e/collection-v2.spec.cjs` (new test at the end)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test.**

```js
test('a refresh waits while an album card menu is open and runs once it closes', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await seed(page, origin, 'First', 0);
    await seed(page, origin, 'Second', 0);
    await openWall(page, origin);
    const cards = page.locator('.folder');
    await expect(cards).toHaveCount(2);
    await cards.nth(0).locator('[data-act=menu]').click();
    await expect(page.locator('.folder .menu')).toBeVisible();
    await seed(page, origin, 'Third', 0); // added elsewhere, as from a phone
    const refreshed = () => page.waitForResponse((response) => new URL(response.url()).pathname === '/api/trash');
    // Coming back to the window refreshes the wall.
    await Promise.all([refreshed(), page.evaluate(() => window.dispatchEvent(new Event('focus')))]);
    await page.waitForTimeout(300);
    await expect(page.locator('.folder .menu')).toBeVisible();
    await expect(cards).toHaveCount(2);
    // Moving to another card's menu: the refresh runs, and waits again for the new menu.
    await Promise.all([refreshed(), cards.nth(1).locator('[data-act=menu]').click()]);
    await page.waitForTimeout(300);
    await expect(page.locator('.folder .menu')).toHaveCount(1);
    await expect(cards.nth(1).locator('.menu')).toBeVisible();
    await expect(cards).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.folder .menu')).toHaveCount(0);
    await expect(cards).toHaveCount(3);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npm run build && npx playwright test e2e/collection-v2.spec.cjs -g "refresh waits"`
Expected: FAIL — the menu is gone after the focus refresh.

- [ ] **Step 3: Implement.** In `src/wall.js`, after `let mutating = false;`:

```js
  let stale = false; // a refresh waiting for an open card menu to close
```

In `load()`, right after `if (!alive || request !== revision) return;`:

```js
      // Drawing the cards again would close an open card menu: refresh once it closes instead.
      stale = Boolean(app.querySelector('.folder .menu'));
      if (stale) return;
```

Replace `const closeMenu = () => app.querySelector('.menu')?.remove();` with:

```js
  const closeMenu = () => {
    app.querySelector('.menu')?.remove();
    if (stale) {
      stale = false;
      void load();
    }
  };
```

- [ ] **Step 4: Run the tests.**

Run: `npm run build && npx playwright test e2e/collection-v2.spec.cjs e2e/context-menu.spec.cjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/wall.js e2e/collection-v2.spec.cjs
git commit -m "fix: keep an album card menu open through a background refresh"
```

### Task 5: Loose non-media files dropped with folders are reported (item 7)

Dropping a folder of photos together with `行程安排.txt` says only “已导入 3 项”. Approved: “已导入 3 项，跳过 1 个不是照片或视频的文件”, as when files are dropped alone.

**Files:**
- Modify: `src/wall.js:122-131` (`counted` moves out of `importFolders`), `:261-271` (`onDrop`)
- Test: `e2e/welcome-import.spec.cjs` (new test after `an album that cannot be created stops only its own folder`)

**Interfaces:**
- Produces: `counted(group)` in `renderWall`'s scope, used by `importFolders` and `onDrop`; Task 6 edits the same `onDrop`.

- [ ] **Step 1: Write the failing test.**

```js
test('files that are not photos, dropped with folders, are counted in the summary', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await expect(page.locator('.welcome')).toBeVisible();
    await dropFiles(page, [
      { name: 'Empty', children: [{ name: '.DS_Store', bytes: Buffer.from('junk') }] },
      { name: 'Trip', children: [
        { name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(130) },
        { name: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(131) },
        { name: 'c.jpg', type: 'image/jpeg', bytes: await jpeg(132) },
      ] },
      { name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('packing list') },
    ]);
    await expect(page.locator('.toast')).toHaveText("Imported 3 items, skipped 1 file that isn't a photo or video", { timeout: 15_000 });
    await expect(page.locator('.folder h2')).toHaveText(['Trip']);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs -g "dropped with folders"`
Expected: FAIL — the toast says only “Imported 3 items”.

- [ ] **Step 3: Implement.** In `src/wall.js`, replace the comment and first line of `importFolders`:

```js
  // A folder with something to import or to report gets an album, named after it and created when
  // its turn comes.
  const counted = (group) => group.files.length || group.unsupported || group.unreadable;

  function importFolders(groups) {
    const empty = groups.filter((group) => !counted(group));
```

(the rest of `importFolders` is unchanged). In `onDrop`, extend the branch after the loose-files dialog:

```js
    } else if (!folders.length) {
      toast(t('nothing-to-import'));
      return;
    } else {
      // Other loose files are reported in the summary, with the first folder that is imported.
      const first = folders.find(counted);
      if (first) {
        first.skipped += loose.skipped;
        first.unsupported += loose.unsupported;
      }
    }
    importFolders(folders);
```

- [ ] **Step 4: Run the tests.**

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/wall.js e2e/welcome-import.spec.cjs
git commit -m "fix: report loose files skipped alongside dropped folders"
```

### Task 6: Show that a drop is being read (item 8)

After a drop, Folio reads every file before importing; for a big folder the page shows nothing meanwhile, and a second drop imports both batches. Approved: show “正在读取拖入的文件…” with the count found so far until the import progress takes over; a drop meanwhile says “请等上一批读完” and is not imported.

**Files:**
- Modify: `src/folder-files.js:60-109`, `src/import-files.js` (new export), `src/wall.js:3,5,243-260`, `src/album.js:7-8,95,551-565`, `src/style.css:350-378`, `src/i18n.js` (after `:144` and `:456`), `README.md` (import section), `e2e/drop-helpers.cjs`
- Test: `src/folder-files.test.js`, `e2e/welcome-import.spec.cjs` (new test)

**Interfaces:**
- Consumes: `counted` and the `onDrop` branch from Task 5.
- Produces: `collectDrop(transfer, onFound = () => {})` — `onFound(n)` gets the running count of files read so far (hidden files inside folders and unreadable ones are not counted); `createDropReader(host)` → `{ reading: boolean (getter), read(transfer): Promise<{ folders, loose } | null> }`; `read` takes the drop's items before its first await and resolves `null` for a drop it turns away; `dropFiles(page, nodes, { delay })` delays every read callback by `delay` ms.

- [ ] **Step 1: Write the failing unit test** in `src/folder-files.test.js`, after `the items are taken while the drop event runs…`:

```js
test('the number of files found so far is reported while a drop is read', async () => {
  const { transfer } = drop(
    { entry: folder('Trip', [
      entry('a.jpg', 'image/jpeg'), entry('.DS_Store'),
      folder('more', [entry('b.jpg', 'image/jpeg'), entry('moved.jpg', 'image/jpeg', { broken: true })]),
    ]) },
    { file: file('c.jpg', 'image/jpeg') },
  );
  const counts = [];
  await collectDrop(transfer, (n) => counts.push(n));
  assert.deepEqual(counts, [1, 2, 3]); // hidden and unreadable files are not counted
});
```

- [ ] **Step 2: Write the failing end-to-end test.** First give `e2e/drop-helpers.cjs` a delay: add `delay = 0` to the options and to the object passed to `page.evaluate`, and use it in `later`:

```js
// … With `drop: false` the files only hover. `delay` (ms) slows every read down, like a big folder.
async function dropFiles(page, nodes, { target = 'body', batch = 2, drop = true, delay = 0 } = {}) {
  return page.evaluate(({ nodes, target, batch, drop, delay }) => {
    const toFile = (node) => new File([Uint8Array.from(atob(node.data), (c) => c.charCodeAt(0))], node.name, { type: node.type });
    const later = (fn) => setTimeout(fn, delay);
```

and `}, { nodes: encode(nodes), target, batch, drop, delay });` at the end. Then in `e2e/welcome-import.spec.cjs`, after the Task 5 test:

```js
test('a drop says it is being read and turns away another drop meanwhile, on the wall and in an album', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const photo = async (name, width) => ({ name, type: 'image/jpeg', bytes: await jpeg(width) });
    const trip = [{ name: 'Trip', children: [await photo('a.jpg', 140), await photo('b.jpg', 141), await photo('c.jpg', 142)] }];
    const again = [{ name: 'Again', children: [await photo('d.jpg', 143)] }];
    const later = [{ name: 'Later', children: [await photo('e.jpg', 144)] }];
    const more = [{ name: 'More', children: [await photo('f.jpg', 145)] }];
    const loose = [await photo('g.jpg', 146)];
    const reading = page.locator('.drop-reading');
    const wait = 'Please wait until the earlier drop has been read';

    await dropFiles(page, trip, { delay: 500 });
    await expect(reading).toBeVisible();
    await expect(reading.locator('b')).toHaveText('Reading the dropped files…');
    // Dragging over the reading panel shows no drop hint, and a drop is turned away.
    expect((await dropFiles(page, again, { drop: false })).hint).toBe(false);
    await dropFiles(page, again);
    await expect(page.locator('.toast')).toHaveText(wait);
    await expect(reading.locator('small')).toContainText('found');
    await expect(page.locator('.toast')).toHaveText('Imported 3 items', { timeout: 15_000 });
    await expect(page.locator('.folder h2')).toHaveText(['Trip']);
    await expect(reading).toBeHidden();
    // Once reading is done, the next drop is imported as usual.
    await dropFiles(page, later);
    await expect(page.locator('.toast')).toHaveText('Imported 1 item', { timeout: 15_000 });
    await expect(page.locator('.folder')).toHaveCount(2);

    // The album page reads the same way.
    const albums = await (await page.request.get(`${origin}/api/albums`)).json();
    await page.goto(`${origin}/#/a/${albums.find((album) => album.title === 'Trip').id}`);
    await expect(page.locator('.tile')).toHaveCount(3);
    await dropFiles(page, more, { delay: 500 });
    await expect(reading).toBeVisible();
    await dropFiles(page, loose);
    await expect(page.locator('.toast')).toHaveText(wait);
    await expect(page.locator('.tile')).toHaveCount(4, { timeout: 15_000 });
    await expect(reading).toBeHidden();
  } finally { await fixture.close(); }
});
```

- [ ] **Step 3: Run both to see them fail.**

Run: `node --test src/folder-files.test.js` — Expected: FAIL, `counts` is `[]`.
Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs -g "being read"` — Expected: FAIL, `.drop-reading` never appears.

- [ ] **Step 4: Count the files found.** In `src/folder-files.js` replace `walk`, `read` and the `collectDrop` comment and signature:

```js
// Adds the folder's files, at any depth, to `found` and calls onFile() for each; returns how many
// could not be read.
async function walk(folder, prefix, found, onFile) {
  let list;
  try { list = await children(folder); } catch { return 1; }
  let unreadable = 0;
  for (const entry of list) {
    if (hidden(entry.name)) continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory) unreadable += await walk(entry, `${path}/`, found, onFile);
    else {
      try { found.push({ path, file: await fileOf(entry) }); } catch { unreadable++; continue; }
      onFile();
    }
  }
  return unreadable;
}

async function read(taken, onFound) {
  const folders = [];
  const loose = [];
  let unreadable = 0;
  let n = 0;
  const onFile = () => onFound(++n);
  for (const { entry, file } of taken) {
    if (entry?.isDirectory) {
      const found = [];
      const failed = await walk(entry, '', found, onFile);
      folders.push({ name: entry.name, ...sortOut(found, failed) });
    } else if (file) {
      loose.push({ path: file.name, file });
      onFile();
    } else if (entry?.isFile) {
      try {
        const loaded = await fileOf(entry);
        loose.push({ path: loaded.name, file: loaded });
      } catch { unreadable++; continue; }
      onFile();
    } else unreadable++;
  }
  return { folders, loose: sortOut(loose, unreadable) };
}

// A drop: each top-level folder is one group, everything else is `loose`; onFound(n) hears how many
// files have been found so far. The browser empties the item list once the drop event is over, so
// every item is taken here, before the first await.
export function collectDrop(transfer, onFound = () => {}) {
```

and make its last line `return read(taken, onFound);`. Run `node --test src/folder-files.test.js` — Expected: PASS.

- [ ] **Step 5: Add the reader.** In `src/import-files.js` add `import { collectDrop } from './folder-files.js';` to the imports and, before `createImporter`:

```js
// Reading a drop can take a while for a big folder: a panel says so and counts the files found until
// the import takes over, and a drop meanwhile is turned away. read() takes the drop's items before
// its first await; it gives null for a drop it turns away.
export function createDropReader(host) {
  host.insertAdjacentHTML('beforeend', `<div class="drop-reading" role="status" hidden><span><i class="spinner" aria-hidden="true"></i><b>${t('drop-reading')}</b><small aria-hidden="true"></small></span></div>`);
  const panel = host.lastElementChild;
  const found = panel.querySelector('small');
  let reading = false;
  return {
    get reading() { return reading; },
    async read(transfer) {
      if (reading) {
        toast(t('drop-wait'));
        return null;
      }
      reading = true;
      found.textContent = '';
      panel.hidden = false;
      try {
        return await collectDrop(transfer, (n) => { found.textContent = t('drop-found', { n }); });
      } finally {
        reading = false;
        panel.hidden = true;
      }
    },
  };
}
```

Copy, in `src/i18n.js` after `'nothing-to-import'` (zh, line 144):

```js
    'drop-reading': '正在读取拖入的文件…',
    'drop-found': ({ n }) => `已找到 ${n.toLocaleString('zh-CN')} 个 · 读完后开始导入`,
    'drop-wait': '请等上一批读完',
```

and after `'nothing-to-import'` (en, line 456):

```js
    'drop-reading': 'Reading the dropped files…',
    'drop-found': ({ n }) => `${n.toLocaleString('en')} ${n === 1 ? 'file' : 'files'} found · Import starts when reading is done`,
    'drop-wait': 'Please wait until the earlier drop has been read',
```

- [ ] **Step 6: Use it on the wall.** In `src/wall.js`: imports become `import { albumTitle, pickedFolder } from './folder-files.js';` and `import { createDropReader, createImporter } from './import-files.js';`. After `const hint = app.querySelector('.drop-hint');`:

```js
  const reader = onComputer ? createDropReader(app.querySelector('.page')) : null;
```

In `onDragOver`, replace `if (document.querySelector('dialog[open]')) return;` with

```js
    if (reader.reading || document.querySelector('dialog[open]')) return; // the reading panel stays in front
```

In `onDrop`, replace the `collectDrop` line and the `alive` check after it with

```js
    const dropped = await reader.read(e.dataTransfer); // takes the items before it awaits
    if (!dropped || !alive) return;
    const { folders, loose } = dropped;
```

- [ ] **Step 7: Use it on the album page.** In `src/album.js`: replace lines 7–8 with `import { createDropReader, createImporter } from './import-files.js';`. After the `importer` line (95):

```js
  const reader = createDropReader(main);
```

In `onDragOver`, after `e.preventDefault();` add `if (reader.reading) return;`. In `onDrop`, replace the `collectDrop` line and the `alive` check after it with

```js
    const dropped = await reader.read(e.dataTransfer); // takes the items before it awaits
    if (!dropped || !alive) return;
    const { folders, loose } = dropped;
```

- [ ] **Step 8: Style the panel.** In `src/style.css` replace lines 350–378 (the `.drop-hint` rules) with:

```css
/* The whole wall takes a drop (polish spec §5); reading a drop shows the same frame. */
.drop-hint,
.drop-reading {
  position: fixed;
  inset: 12px;
  z-index: 80;
  display: grid;
  place-items: center;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-20);
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.drop-hint span,
.drop-reading span {
  display: grid;
  justify-items: center;
  gap: 10px;
  color: var(--ink);
  font-size: var(--text-16);
  line-height: var(--leading-16);
  font-weight: 600;
}

.drop-hint svg {
  width: 40px;
  height: 40px;
  color: var(--accent);
}

/* Clicks wait while a drop is read. */
.drop-reading {
  pointer-events: auto;
  cursor: progress;
}

.drop-reading .spinner {
  width: 40px;
  height: 40px;
  box-sizing: border-box;
  border: 3.5px solid color-mix(in srgb, var(--accent) 20%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
}

.drop-reading small {
  color: var(--ink-3);
  font-size: var(--text-14);
  line-height: var(--leading-14);
  font-weight: 400;
}

.drop-reading small:empty {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  .drop-reading .spinner {
    animation: spin 0.9s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}
```

- [ ] **Step 9: Document it.** In `README.md`, after the three bullets of the 导入 section, add a paragraph:

```markdown
松手后 Folio 先读一遍拖入的文件，文件多时要等一会儿：这时显示「正在读取拖入的文件…」和已找到的数量，读完再开始导入；读取期间再拖入会提示「请等上一批读完」，不会重复导入。
```

- [ ] **Step 10: Run the tests.**

Run: `npm test && npm run build && npx playwright test e2e/welcome-import.spec.cjs`
Expected: PASS (`welcome-import` holds every drop test, on the wall and in an album).

- [ ] **Step 11: Commit.**

```bash
git add src/folder-files.js src/folder-files.test.js src/import-files.js src/wall.js src/album.js src/style.css src/i18n.js README.md e2e/drop-helpers.cjs e2e/welcome-import.spec.cjs
git commit -m "feat: show that dropped files are being read"
```

### Task 7: A page loaded in full screen closes the traffic-light gap (item 9)

Full screen hides the Mac traffic lights and `html[data-fullscreen]` closes their gap, but the attribute only comes with enter/leave events, so a page loaded in full screen (another library, a reload) keeps a 96 px gap. Ask on load.

**Files:**
- Modify: `desktop/desktop-info.cjs:1,10-11`, `desktop/main.cjs:413-415`, `src/desktop.js:7-9`
- Test: `desktop/desktop-info.test.cjs:13-18`, `e2e/window-chrome.spec.cjs:101-103`

**Interfaces:**
- Produces: `desktopInfo({ version, libraryDir, home, platform, update, fullscreen })` → `{ version, library, update, fullscreen }`; `window.folioDesktop.info()` resolves with `fullscreen: boolean`.

- [ ] **Step 1: Write the failing tests.** Replace the second test of `desktop/desktop-info.test.cjs`:

```js
test('the desktop info carries the version, the library as shown, the update state and full screen', () => {
  assert.deepEqual(
    desktopInfo({ version: '0.1.0', libraryDir: '/home/mi/相册库', home: '/home/mi', platform: 'linux', update: { phase: 'idle' }, fullscreen: false }),
    { version: '0.1.0', library: '~/相册库', update: { phase: 'idle' }, fullscreen: false },
  );
});
```

In `e2e/window-chrome.spec.cjs`, Mac branch, after `expect(await left()).toBeLessThan(78);` (line 103):

```js
      // A page loaded in full screen (choosing another library loads it again) closes the gap too.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-fullscreen', '', { timeout: 10_000 });
      expect(await left()).toBeLessThan(78);
```

- [ ] **Step 2: Run them to see them fail.**

Run: `node --test desktop/desktop-info.test.cjs` — Expected: FAIL, `fullscreen` missing.
Run: `npm run build && npx playwright test e2e/window-chrome.spec.cjs -g "traffic-light gap"` — Expected (Mac): FAIL, no `data-fullscreen` after the reload.

- [ ] **Step 3: Implement.** `desktop/desktop-info.cjs`:

```js
// What the page learns about the desktop app (polish spec §6.4): Settings shows the version, the
// library and the update state; a page loaded in full screen closes the traffic-light gap.
```

```js
function desktopInfo({ version, libraryDir, home, platform, update, fullscreen }) {
  return { version, library: displayPath(libraryDir, home, platform), update, fullscreen };
}
```

`desktop/main.cjs:413-415`:

```js
  handle('folio:desktop:info', () => desktopInfo({
    version: metadata.version, libraryDir: settings.libraryDir, home: app.getPath('home'), platform: process.platform, update: updates.status(),
    fullscreen: window.isFullScreen(),
  }));
```

`src/desktop.js`, replace the `desktop.onState(…)` call:

```js
  // Changes come as state; a page loaded in full screen (another library, a reload) asks.
  const setFullscreen = (state) => {
    if (typeof state?.fullscreen === 'boolean') document.documentElement.toggleAttribute('data-fullscreen', state.fullscreen);
  };
  desktop.onState(setFullscreen);
  desktop.info().then(setFullscreen).catch(() => {});
```

- [ ] **Step 4: Run the tests.**

Run: `npm test && npm run build && npx playwright test e2e/window-chrome.spec.cjs e2e/settings.spec.cjs`
Expected: PASS (the existing `setFullScreen(false)` check after the reload also pins the state events).

- [ ] **Step 5: Commit.**

```bash
git add desktop/desktop-info.cjs desktop/desktop-info.test.cjs desktop/main.cjs src/desktop.js e2e/window-chrome.spec.cjs
git commit -m "fix: close the traffic-light gap when a page loads in full screen"
```

### Task 8: 3D and date internals (items 10, 11, 13)

Item 10: on a CPU renderer the title page's small print measured 4.2–4.4:1; darken it to `#4a5662` (6.42:1 on the `#e9eef2` board, the colour of the 3D captions). Item 11: `formatRange` builds a new `Intl.DateTimeFormat` for every English call (about 98 ms for 5,000 photos); build two once. Item 13: when `createStage` throws for missing WebGL2, the binder already listens for theme changes and is never released.

**Files:**
- Modify: `src/book/title-page.js:11`, `shared/dates.js:17-20`, `src/book/book.js:17-19`
- Test: `e2e/book-pages.spec.cjs:387-392` and a new test at its end, `shared/dates.test.js`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test for item 10.** In `the title page reads in both themes…`, after the `for (const [name, list] …)` loop:

```js
    // A CPU renderer softens thin strokes: drawn at 5.3:1 the small print measured 4.2–4.4:1.
    for (const ratio of result.plain.slice(1)) expect(ratio, 'plain board small print, with room for a CPU renderer').toBeGreaterThanOrEqual(6);
```

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs -g "title page reads"` — Expected: FAIL, 5.27 < 6.

- [ ] **Step 2: Implement item 10.** `src/book/title-page.js:11`: `small: '#56636f'` → `small: '#4a5662'`. Run the same command — Expected: PASS. Commit:

```bash
git add src/book/title-page.js e2e/book-pages.spec.cjs
git commit -m "fix: darken the 3D title page small print"
```

- [ ] **Step 3: Write the failing test for item 11.** At the end of `shared/dates.test.js`:

```js
test('English dates reuse their formatters instead of making one each time', () => {
  const Original = Intl.DateTimeFormat;
  let made = 0;
  Intl.DateTimeFormat = function (...args) { made++; return new Original(...args); };
  try {
    for (let i = 0; i < 100; i++) {
      formatRange('2026-07-12', '2026-07-15');
      formatRange('2026-07-02', '2026-07-15', { month: true });
    }
  } finally { Intl.DateTimeFormat = Original; }
  assert.ok(made <= 2, `${made} formatters made`);
});
```

Run: `node --test shared/dates.test.js` — Expected: FAIL, `200 formatters made`.

- [ ] **Step 4: Implement item 11.** In `shared/dates.js` replace `english`:

```js
// Made once: a new formatter for every photo is slow in albums with thousands of them.
const ENGLISH = {
  day: new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }),
  month: new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'short' }),
};

function english(a, b, month) {
  const format = month ? ENGLISH.month : ENGLISH.day;
  return plain(b ? format.formatRange(a.date, b.date) : format.format(a.date));
}
```

Run: `npm test` — Expected: PASS (the existing date tests show the output is unchanged). Commit:

```bash
git add shared/dates.js shared/dates.test.js
git commit -m "perf: reuse the English date formatters"
```

- [ ] **Step 5: Write the failing test for item 13.** At the end of `e2e/book-pages.spec.cjs`:

```js
test('a book that cannot get WebGL stops following the theme', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/book.js', '/__folio-book-no-webgl.js');
    const result = await page.evaluate(async () => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      const { addEventListener: add, removeEventListener: remove } = document;
      const listening = new Set();
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /webgl/i.test(type) ? null : getContext.call(this, type, ...args);
      };
      document.addEventListener = function (type, listener, ...args) {
        if (type === 'folio-theme') listening.add(listener);
        return add.call(this, type, listener, ...args);
      };
      document.removeEventListener = function (type, listener, ...args) {
        if (type === 'folio-theme') listening.delete(listener);
        return remove.call(this, type, listener, ...args);
      };
      const container = document.createElement('div');
      document.body.append(container);
      try {
        const { createBook } = await import('/__folio-book-no-webgl.js');
        createBook(container, {
          title: 'Summer', titlePage: { title: 'Summer', dates: '', count: '1 photo' }, pages: [{ rects: [] }],
          photoUrl: () => '', insets: { top: 0, bottom: 0 }, onChange() {}, onPhotoClick() {},
        });
        return { error: null, listening: listening.size };
      } catch (error) {
        return { error: error.message, listening: listening.size };
      } finally {
        HTMLCanvasElement.prototype.getContext = getContext;
        delete document.addEventListener;
        delete document.removeEventListener;
        container.remove();
      }
    });
    expect(result).toEqual({ error: 'webgl', listening: 0 });
  } finally { await fixture.close(); }
});
```

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs -g "cannot get WebGL"` — Expected: FAIL, `listening: 1`.

- [ ] **Step 6: Implement item 13.** `src/book/book.js`, replace `const stage = createStage(…);`:

```js
  // Without WebGL there is no book; the binder already follows the theme, so let it go.
  let stage;
  try { stage = createStage(container, binder.xb + binder.B, insets, () => requestRender()); }
  catch (error) { binder.dispose(); throw error; }
```

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs` — Expected: PASS. Commit:

```bash
git add src/book/book.js e2e/book-pages.spec.cjs
git commit -m "fix: release the 3D binder when WebGL is missing"
```

### Task 9: Tests that check what they claim (items 12, 14, 15, 16)

Test-only changes. Each one is proven by a temporary product mutation that the old test misses and the new test catches; every mutation is reverted before the commit (`git diff --stat` shows only spec files).

**Files:**
- Test: `e2e/collection-v2.spec.cjs:116`, `e2e/pdf-export.spec.cjs:250-251`, `e2e/book-autoplay.spec.cjs:149`, `e2e/window-chrome.spec.cjs:117-130`

**Interfaces:** none.

- [ ] **Step 1: Item 12 — the trash preview checks the controls that exist.** `e2e/collection-v2.spec.cjs:116` checks `[data-act=cover]`, which moved into ⋯ in S2. Replace it with:

```js
    // No ⋯ and nothing from it: no cover, copy, move or delete in a trash preview.
    await expect(page.locator('.lb [data-act=menu], .lb [data-act^=menu-], .lb [data-act^=sheet-], .lb [data-act=delete]')).toHaveCount(0);
```

Mutation: in `src/lightbox.js:45` render the `.lb-menu` block in trash mode too (drop the `trashActions ? '' :` condition around it); `npm run build && npx playwright test e2e/collection-v2.spec.cjs -g "trash preview"` must FAIL; revert, rebuild, run again: PASS.

- [ ] **Step 2: Item 14 — the PDF cover date in Chinese.** In `the PDF cover writes the capture dates…`, after the English cancel (line 251):

```js
    // Chinese is spelled out by hand, not by Intl: check it too.
    await f.desktop.context().addCookies([{ name: 'folio_lang', value: 'zh', url: f.origin }]);
    await f.page.reload();
    await f.page.locator('.album-page [data-act=menu]').click();
    await f.page.locator('[data-act=pdf]').click();
    await expect(f.page.locator('.pdf-export .print-cover p')).toHaveText('2026年7月12日–15日');
    await f.page.locator('.pdf-export [data-act=cancel]').click();
```

Mutation: `src/print-layout.js:34` `{ lang: language }` → `{}`; `npm run build && npx playwright test e2e/pdf-export.spec.cjs -g "capture dates"` must FAIL; revert, rebuild: PASS.

- [ ] **Step 3: Item 15 — auto-flip idle test independent of the real mouse.** In `faded controls stay hidden across page turns until the mouse moves`, replace `await page.mouse.move(5, 5);` with:

```js
    // Only page turns are under test: a real mouse over the window, or a mousemove Chromium fakes
    // when the layout changes under the pointer, must not wake the controls.
    await page.evaluate(() => addEventListener('pointermove', (e) => e.stopPropagation(), true));
```

Mutations, each reverted: (a) add `await page.mouse.move(400, 400);` before `await expect(page.locator('.ab-count')).toHaveText('2 / 3', …)` — the old test FAILS, the new one PASSES; (b) `src/viewer.js:174` `if (changed) wake();` → `wake();` — the new test FAILS. Command: `npm run build && npx playwright test e2e/book-autoplay.spec.cjs -g "faded controls"`.

- [ ] **Step 4: Item 16 — check the window before the page can talk.** Replace the test at `e2e/window-chrome.spec.cjs:117-130` with:

```js
test('the appearance chosen in Settings sets the native theme and the window colour, also on the next launch', async () => {
  const fixture = await desktopFixture();
  try {
    let { desktop, page } = await fixture.launch();
    const source = () => desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
    const settings = await openSettings(page);
    await settings.locator('[data-theme-mode=dark]').click();
    await expect.poll(source).toBe('dark');
    await settings.locator('[data-theme-mode=auto]').click();
    await expect.poll(source).toBe('system');
    await settings.locator('[data-theme-mode=dark]').click();
    await expect.poll(source).toBe('dark');
    await fixture.stop();
    // The page also reports the appearance once it loads: hold it, so only the app's start-up counts.
    ({ desktop } = await fixture.launch({ args: ['--fixture-hold-initial-load'], waitForReady: false }));
    await expect.poll(() => desktop.evaluate(() => typeof global.folioTestInitialLoadReject)).toBe('function');
    expect((await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor())).toLowerCase()).toBe('#121417');
    expect(await source()).toBe('dark');
    const closed = desktop.waitForEvent('close', { timeout: 5000 });
    await desktop.evaluate(({ app }) => { app.quit(); global.folioTestInitialLoadReject(); });
    await closed;
  } finally { await fixture.close(); }
});
```

Mutation: `desktop/main.cjs:234` `themeSource(settings.appearance)` → `'system'`; `npm run build && npx playwright test e2e/window-chrome.spec.cjs -g "appearance chosen"` must FAIL (the old test passes); revert, rebuild: PASS.

- [ ] **Step 5: Commit** (after `git diff --stat` shows only the four spec files):

```bash
git add e2e/collection-v2.spec.cjs e2e/pdf-export.spec.cjs e2e/book-autoplay.spec.cjs e2e/window-chrome.spec.cjs
git commit -m "test: make four Folio checks test what they claim"
```

### Task 10: Verify, review and open the PR

**Files:** none beyond review fixes.

- [ ] **Step 1: Full verification.**

Run: `npm test && npm run build && npm run test:desktop && git diff --check origin/main...HEAD`
Expected: all pass. A one-off failure unrelated to this branch is re-run on its own and recorded; a repeatable one is fixed.

- [ ] **Step 2: Look at the result.** Screenshots in both languages where copy changed, compared with the approved “改后” states: 1 (sheet, cover and non-cover), 3 (menu with `data-desktop=win`), 4 (390 px wall), 5 (menu open after focus), 6B (320 and 390 px), 7 (summary toast), 8 (reading panel, light and dark, wall and album page), 9 (Mac full screen after reload).

- [ ] **Step 3: Whole-branch review** by a fresh reviewer against this plan; fix findings test-first, then repeat Step 1.

- [ ] **Step 4: Push and open the PR** to `main` (`fix/folio-minor-fixes`); watch the Windows and macOS checks; fix real failures; do not merge. Item 3 still needs a look on a real Windows machine.
