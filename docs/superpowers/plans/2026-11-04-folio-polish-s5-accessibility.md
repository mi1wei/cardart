# Folio S5 Typography and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish approved items 11–12 with consistent readable UI typography/radii, usable pointer targets, and accurate accessible names/headings.

**Architecture:** Keep the existing stylesheets and page/action ownership. Define shared size/leading and radius custom properties in `style.css`, consume them in the three UI stylesheets plus PDF-export controls, and add narrowly scoped pointer-size rules. Update only the existing DOM labels and heading selectors; no component framework, dependencies, backend changes or new features.

**Tech Stack:** Electron 45, vanilla JavaScript/CSS, Node test runner, Playwright Electron.

**Spec:** `docs/superpowers/specs/2026-11-03-folio-polish-design.md` §7–10. S1–S4 are predecessors; S4b commands and menus are preserved.

## Global Constraints

- Seven UI sizes/leadings: 12/16, 13/18, 14/20, 16/24, 20/28, 24/32, 28/36 px. No UI text below 12 px.
- Five radius tokens: 4, 8, 12, 20 and 999 px. Keep 50% circles and `.pocket` illustration parts unchanged.
- Physical 3D/printed-page typography and printed-page millimetre geometry are not UI tokens; do not change their layout.
- Coarse-pointer targets are at least 44×44; desktop targets are at least 24×24. A labelled checkbox may use the associated label as its larger hit area while keeping a 24 px visual control.
- Preserve visible copy, translated Chinese/English names, keyboard operation, import/busy/license/draft protection, and phone layout.
- Keep the existing application behavior and native bridge unchanged; no dependencies.
- Work in `.worktrees/folio-polish-s5`, branch `feat/folio-polish-s5`, stacked on completed S4b. Do not alter unrelated checkouts or merge shared branches.

## Review Focus

1. A 320 px coarse-pointer phone in English must retain accessible toolbar/Settings controls without horizontal overflow or overlapping hit areas; Task 2 tests 320 and 390 px.
2. Coarse-pointer media emulation must be real, not a narrow desktop viewport; Task 2 enables CDP touch emulation and asserts `(pointer: coarse)` before geometry checks.
3. Enlarged card-menu and checkbox hit areas must still invoke the intended action rather than opening the surrounding album/preview; Task 2 clicks actual outer hit-area coordinates.
4. Names must remain correct after cover changes, album rename, language change and viewer navigation; Task 2 asserts visible-text containment before and after updates.
5. Typography changes must not alter printed millimetre layouts or clip long localized metadata/notes; Task 1 runs existing PDF/notes/card-layout coverage and Task 3 captures both themes and narrow layouts.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `src/style.css` | Seven size/leading pairs, five radii, common/card/Settings/3D UI consumers and pointer rules |
| `src/photo-view.css` | Viewer/details/note typography, radii, and touch controls |
| `src/collection.css` | Wall/batch/trash typography/radii and targets |
| `src/print-layout.css` | Only PDF-export UI controls; printed `.print-*` geometry is unchanged |
| `src/folder.js`, `src/album.js` | Card `h2`, photo filename plus cover accessible name |
| `src/lightbox.js`, `src/lightbox-text.js`, `src/i18n.js` | Back-to-album and actual-size localized names |
| `e2e/accessibility.spec.cjs` | Real rendered text, names, headings and hit areas |
| `e2e/collection-v2.spec.cjs` | Dependent card-heading lookup |
| `README.md` | Brief accessibility/typography behavior documentation |

### Task 1: Shared typography and radius consumers

**Consumes:** current four stylesheets and existing page DOM.
**Produces:** `--text-{12,13,14,16,20,24,28}`, matching `--leading-*`, and `--radius-{4,8,12,20,pill}`. No JS interface changes.

1. Create `e2e/accessibility.spec.cjs`. Use `desktopFixture`, `seed`, `openWall`, and `openSettings`. For wall, album, Settings, help, License, PDF-export controls and viewer details/note editor, inspect visible nonempty text nodes outside `.print-sheet`, scripts and styles:

```js
const sizes = [12, 13, 14, 16, 20, 24, 28];
const leading = { 12: 16, 13: 18, 14: 20, 16: 24, 20: 28, 24: 32, 28: 36 };
const bad = await page.locator('body').evaluate((root, { sizes, leading }) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const bad = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || el.closest('.print-sheet, script, style') ||
        !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const css = getComputedStyle(el);
    const size = parseFloat(css.fontSize);
    if (!sizes.includes(size) || parseFloat(css.lineHeight) !== leading[size])
      bad.push({ text: node.textContent.trim().slice(0, 60), size, line: css.lineHeight });
  }
  return bad;
}, { sizes, leading });
expect(bad).toEqual([]);
```

Include a narrow viewer count and read-only note label so the known 9–11 px text is exercised. Do not assert CSS source strings.
2. Run `npm run build && npx --no-install playwright test e2e/accessibility.spec.cjs --grep typography --reporter=line`. Expected: failure identifying rendered text outside the specified readable tiers, not fixture errors.
3. Add the custom properties to `:root`:

```css
--text-12: 12px; --leading-12: 16px;
--text-13: 13px; --leading-13: 18px;
--text-14: 14px; --leading-14: 20px;
--text-16: 16px; --leading-16: 24px;
--text-20: 20px; --leading-20: 28px;
--text-24: 24px; --leading-24: 32px;
--text-28: 28px; --leading-28: 36px;
--radius-4: 4px; --radius-8: 8px; --radius-12: 12px;
--radius-20: 20px; --radius-pill: 999px;
```

Replace UI font declarations with their appropriate size and leading without resetting font weight/family. Add an explicit `small` tier so UA percentage sizing cannot create a hidden eighth size. Main/page headings use 28 (24 narrow), dialog/section headings 20, album-card titles 16, License status title 24 at every width, and remaining existing sizes follow the §7.1 mapping. Normalize inherited-line-only overrides as needed. Keep monospace families.
4. Replace UI radii by purpose: photo/small-label/progress 4, inputs/menu-items 8, cards/menus/floating panels/toasts 12, dialogs/drop zones/large License panel 20, capsule controls pill. Preserve `.pocket`/parts, circles, zero corners, and physical print shapes. Leave printed `.print-*` rules unchanged. Let card metadata rows grow to fit a 24 px title line.
5. Run `npm test && npm run build && npx --no-install playwright test e2e/accessibility.spec.cjs e2e/settings.spec.cjs e2e/license-ui.spec.cjs e2e/collection-v2.spec.cjs e2e/photo-notes.spec.cjs e2e/pdf-export.spec.cjs --reporter=line`. Expected: pass, including old long-name/date and print-layout behavior.
6. Commit `style: unify Folio UI typography and radius tokens`.

### Task 2: Usable targets, names and heading hierarchy

**Consumes:** Task 1 tokens, existing DOM/action callbacks.
**Produces:** rendered desktop/coarse-pointer target rules and localized accessible names; existing actions/signatures unchanged.

1. Extend `e2e/accessibility.spec.cjs` with desktop density/trash target cases and a coarse-pointer flow. Enable actual touch media:

```js
const session = await desktop.context().newCDPSession(page);
await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
for (const width of [320, 390]) {
  await page.setViewportSize({ width, height: 844 });
  const box = await page.locator('.nav-settings').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}
```

Check wall menu, back link, sort/select, batch controls, Settings buttons, viewer bar/zoom/filmstrip/details/note actions, 3D bar/footer/speed/select controls, and trash checkbox hit area. Assert page/dialog overflow is absent and click the card-menu/checkbox edge, not just CSS geometry. A checkbox label's real hit area is acceptable; verify it toggles the checkbox.
2. Add name/hierarchy assertions in English and Chinese:

```js
await expect(page.getByRole('heading', { name: album.title, level: 2 })).toBeVisible();
await expect(page.locator('.tile').first()).toHaveAccessibleName('p0.jpg, Cover');
await expect(page.locator('.lb-back')).toHaveAccessibleName(`Back to “${album.title}”`);
await expect(page.locator('.lb-zoom [data-act=actual]')).toHaveAccessibleName('1:1 Actual size');
```

Change the cover and album title through existing real actions/API, refresh, and assert updated names. In Chinese assert filename plus `封面`, album title in the back name, and contiguous visible `1:1`.
3. Run `npm run build && npx --no-install playwright test e2e/accessibility.spec.cjs --grep 'target|name|heading' --reporter=line`. Expected: failures at known 16–40 px controls, missing cover/back names, and card level 3.
4. Set common desktop button/link/control minima to 24 where needed; density/book range height 24, trash checkbox 24 without flex shrink. For coarse pointers use 44 px controls, including inherited more-specific viewer/Settings/3D rules. Enlarge label/associated-checkbox hit areas where a 44 px glyph would be visually excessive. Keep native controls and click handlers, allow existing responsive rows to wrap, and reserve enough horizontal room for the narrow viewer title/count/actions.
5. Change folder heading `h3` to `h2` and update its CSS and dependent `collection-v2` lookup together. Compose photo tile label from filename, video information when present, and visible Cover when current. Set the viewer back accessible name from the current `album.title` in `show()`, not only its initial HTML. Update `actual` translation to `1:1 Actual size` / `1:1 实际大小`.
6. Run `npm test && npm run build && npx --no-install playwright test e2e/accessibility.spec.cjs e2e/collection-v2.spec.cjs e2e/settings.spec.cjs e2e/lightbox-v2.spec.cjs e2e/photo-notes.spec.cjs e2e/book-portrait.spec.cjs e2e/book-auto.spec.cjs e2e/context-menu.spec.cjs --reporter=line`. Expected: pass; keyboard, gestures, names and guarded actions retained.
7. Commit `feat: improve Folio pointer targets and accessible labels`.

### Task 3: Full acceptance, documentation and delivery

**Consumes:** Tasks 1–2 and the approved 12-item design.
**Produces:** verified, committed, pushed S5 feature branch/PR and durable session evidence.

1. Document readable minimum UI text, touch targets, accessible labels and heading changes in README without claiming device-level/manual Windows testing.
2. Capture actual wall/Settings/viewer/3D/trash in Chinese light and English dark; include 320/390 px coarse-pointer screens, long album titles and date metadata. Compare with approved item 11/12 mockups. Capture only after building.
3. Dispatch one read-only whole-branch reviewer from the final S4b base to HEAD, with this plan/spec, Review Focus verbatim, and all ledger rulings. Re-grade findings by effect; fix Important/Critical with failing regressions in one pass; defer genuine minors explicitly.
4. Run `npm test && npm run build && npm run test:desktop` with temporary `caffeinate -di` and log the full output. Expected: no failures; existing platform skips remain. Run `git diff --check`. No new formatter/linter is present in package.json.
5. Save final ledger, logs, screenshots and review result in the session artifacts, then clean only this plan's scratch directory. Commit remaining documentation/fixes, push `feat/folio-polish-s5` and open its stacked PR against S4b while unmerged or main if merged. Check actual remote SHA and CI conclusions; report account-level Actions blocks honestly and do not merge.

## Self-review

- §7.1/7.2: Task 1 covers tokens and all UI stylesheet consumers; printed/3D millimetre exclusions explicit.
- §7.3: Task 2 covers fine/coarse pointers, live labels, and card hierarchy with real controls.
- §8–10: existing guards/actions stay unchanged; Task 3 handles full tests, documentation and delivery.
- Shared interface: T1 tokens → T2 pointer styles; T2 names/heading selectors → T3 screenshots. No new JS API or dependency.
- Approved full spec and repeated requests to continue preserve inline execution; this plan does not reopen the selected design.
