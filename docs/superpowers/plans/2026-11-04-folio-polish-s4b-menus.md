# Folio S4b Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the application menus, keyboard help and accessible in-app context menus from the approved design.

**Architecture:** A shared command contract validates page context and command availability on both sides of IPC. Native menus send only whitelisted command names; renderer commands call existing album, wall and settings actions. A single reusable context-menu component handles positioning, keyboard navigation and focus, while each page owns its actions.

**Tech Stack:** Electron 45, vanilla JavaScript, Node test runner, Playwright Electron.

**Spec:** `docs/superpowers/specs/2026-11-03-folio-polish-design.md` §6.2–6.4 and §8–10. S4a owns title bars and window/settings persistence; S5 owns typography, radii and target sizes.

## Global Constraints

- Browser and phone behavior stays unchanged except the documented `?` keyboard help; phones keep long-press selection, not context menus.
- Native application menu on macOS; Windows menu bar hidden but accelerators active.
- Preserve the tray menu and macOS's already-hidden manual update entry.
- `folio:command` carries only whitelisted names; `folio:context` accepts only validated page, busy, appearance and density values from the main app frame.
- All mutations keep license, busy and unsaved-note guards. Destructive actions use the existing confirmations.
- Native text menus appear only for editable text or a nonempty selection.
- Every new visible string is localized in Chinese and English.
- No dependencies or service-side changes.

## Review Focus

1. A file-picker command after user activation expires must still open the picker. Task 2 tests wait beyond the activation lifetime before invoking the native menu.
2. Import in progress or an unsaved note must not be discarded by New album, Import folder or License commands. Task 2 pins the busy and draft guards.
3. Context-menu keyboard handling must not bubble into album selection or 3D navigation; Escape restores the opener, and edge positioning remains onscreen. Task 3 tests keyboard-only and lower-right openings.
4. Right-clicking an unselected photo must not operate on a different selection; a selected photo's batch menu must act on the whole selection. Task 3 tests single cover and selected copy/delete flows.
5. License expiry, page changes and overlay changes between opening a menu and activating an item must be checked again. Task 2 and Task 3 cover readonly and context changes.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `shared/commands.js`, `shared/commands.test.js` | command whitelist, context validation and availability |
| `desktop/app-menu.cjs`, `desktop/app-menu.test.cjs` | platform menu template and native text menu |
| `desktop/main.cjs`, `desktop/preload.cjs` | IPC wiring, accelerators, native text menu |
| `src/desktop.js`, `src/main.js`, `src/nav.js` | page context and command dispatch |
| `src/shortcuts.js`, `src/settings.js`, `src/i18n.js` | localized help dialog and settings entry |
| `src/context-menu.js` | context-menu lifecycle, keyboard, positioning |
| `src/album.js`, `src/wall.js`, `src/trash.js` | existing action integration |
| `src/viewer.js`, `src/lightbox.js` | starting photo and focus-note entry points |
| `src/style.css` | context menu and shortcut-table presentation |
| `e2e/desktop-menus.spec.cjs`, `e2e/context-menu.spec.cjs` | user-visible menu flows |
| `e2e/library-switch.spec.cjs`, `README.md` | dependent menu lookup and documentation |

### Task 1: Validated commands and native menus

**Interfaces**
- `COMMANDS: string[]`, `normalizeContext(value): Context|null`, `commandAllowed(name, context, writable): boolean`.
- Context: `{ page: 'albums'|'album'|'trash'|'license', busy: boolean, appearance: 'light'|'dark'|'auto', density: 's'|'m'|'l' }`.
- Names: `new-album`, `add-photos`, `import-folder`, `export-pdf`, `settings`, `license`, `shortcuts`, `appearance-light`, `appearance-dark`, `appearance-auto`, `density-s`, `density-m`, `density-l`.
- `appMenu({ platform, text, context, writable, enabled, updates, send, actions })` returns an Electron template.
- `textMenu(params)` returns a fixed edit template or `null`.

**Files:** create `shared/commands{,.test}.js`, `desktop/app-menu{,.test}.cjs`; modify `desktop/main.cjs`, `desktop/preload.cjs`, `e2e/library-switch.spec.cjs`.

1. Write tests for invalid contexts, unknown commands, readonly/busy/album-only availability and native text-menu selection.

```js
assert.equal(normalizeContext({ page: 'album', busy: 'yes', appearance: 'dark', density: 'm' }), null);
assert.equal(commandAllowed('add-photos', { page: 'albums', busy: false }, true), false);
assert.equal(commandAllowed('new-album', { page: 'album', busy: true }, true), false);
assert.equal(commandAllowed('new-album', { page: 'album', busy: false }, false), false);
assert.equal(commandAllowed('appearance-dark', { page: 'license', busy: true }, false), true);
assert.equal(textMenu({ isEditable: false, selectionText: '' }), null);
```

2. Run `node --test shared/commands.test.js desktop/app-menu.test.cjs`. Expected: missing modules/functions.
3. Implement validation using literal allowed-value arrays and strict booleans. Reject unknown commands; permit readonly appearance/density/help, but restrict upload/export to writable, idle albums.

```js
export function normalizeContext(value) {
  if (!value || !['albums', 'album', 'trash', 'license'].includes(value.page) ||
      typeof value.busy !== 'boolean' || !['light', 'dark', 'auto'].includes(value.appearance) ||
      !['s', 'm', 'l'].includes(value.density)) return null;
  return { page: value.page, busy: value.busy, appearance: value.appearance, density: value.density };
}
```

4. Build macOS Folio, File, Edit, View, Window, Help menus. Preserve `license`, `updates`, `third-party-notices`, `choose-library`, `quit` IDs. File accelerators: CmdOrCtrl+N/O, CmdOrCtrl+Shift+O/E; settings CmdOrCtrl+,; help CmdOrCtrl+/. View has appearance and density radio groups. Keep original tray items separately.
5. Wire validated sender/context to `folio:context`, frozen bridge methods `setContext` and `onCommand`, and `folio:command`. Before file commands, activate the renderer with a constant `executeJavaScript('void 0', true)` then send the command; no renderer-provided JavaScript is executed.
6. Native text-menu listener uses only `textMenu(params)` and fixed Electron roles. Switch library tests use `getMenuItemById('choose-library')`, not the first submenu.
7. Run Node tests plus existing updates/library-switch/license-navigation/notices/recovery tests. Expected: pass. Commit `feat: add validated desktop commands and native application menus`.

### Task 2: Renderer commands and keyboard help

**Consumes:** Task 1's command/context contract.
**Produces:** `view.command(name)` for album/wall actions; `view.desktopContext()` for density; `nav.settings()`; `openShortcuts()`; `initDesktop({ onCommand, getContext })`.

**Files:** create `src/shortcuts.js`, `e2e/desktop-menus.spec.cjs`; modify `src/main.js`, `src/desktop.js`, `src/nav.js`, `src/wall.js`, `src/album.js`, `src/settings.js`, `src/i18n.js`, `src/style.css`.

1. Add actual Electron menu tests:

```js
await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('new-album').click());
await expect(page.locator('dialog.dlg .dlg-input')).toBeVisible();
await page.locator('.dlg-input').fill('From the menu');
await page.locator('dialog [value=ok]').click();
await expect(page.locator('.album-page .title')).toHaveText('From the menu');
```

Also assert album-only enablement, appearance/density persistence, settings, keyboard help, unknown-command rejection, readonly and data-busy guards, and Add photos after a six-second idle period.
2. Run `npm run build && npx playwright test e2e/desktop-menus.spec.cjs`. Expected: menu commands do not reach the page.
3. Renderer reports context only when its normalized JSON changes. Observe `data-busy`, `data-theme`, `data-density` and page replacement. Subscribe to `onCommand`, check the shared whitelist, and route through `view.command`.
4. Main-page commands:
   - Settings uses the same nav settings function and language redraw callback.
   - New album calls the existing wall button when on the wall; elsewhere, call `view.canLeave()` before and after the existing title dialog, then `api.createAlbum`, then router `open`.
   - Import folder navigates to the wall only if `canLeave` allows; then calls the wall's folder picker.
   - License uses router `open('#/license')`, not `window.loadURL`, preserving the existing leave guard.
   - Appearance calls `setTheme`; density uses the album's existing range input handler.
   - Ignore non-help commands while a modal dialog is open.
5. Add localized shortcut groups: Global, Album, Selection, Photo viewer, 3D. Show only existing shortcuts: `?`, desktop accelerators, Ctrl/Meta+A, modifier/Shift click, Delete/Backspace, Escape, arrows, PageUp/Down, Space, `I`, `+/-/0`. `?` ignores editable elements and modifier combinations. Settings includes a shortcut-help button for Windows accessibility without a menu bar.
6. Run menu tests plus settings/license-navigation/welcome-import/labels tests. Expected: pass. Commit `feat: connect desktop menus and add keyboard help`.

### Task 3: Accessible context menus and existing actions

**Consumes:** existing `api`, license guards, dialogs, `downloadPhotos`, selection/transfer actions.
**Produces:**
- `bindContextMenu(host, selector, itemsFor): cleanup`
- item: `{ id, label, run, write?, disabled?, danger? }`; `null` separates groups.
- `openViewer({ ..., startIndex = 0 })`, `lightbox.editNote()`.

**Files:** create `src/context-menu.js`, `e2e/context-menu.spec.cjs`; modify album/wall/trash/viewer/lightbox/styles/i18n.

1. Add tests that open a photo's context menu by right click, navigate with arrows and Escape, open via Shift+F10, and verify onscreen position near the lower-right corner.

```js
await page.locator('.tile').nth(1).click({ button: 'right' });
await expect(page.locator('.context-menu')).toBeVisible();
await page.locator('.context-menu [data-context=cover]').click();
await expect(page.locator('.tile').nth(1).locator('.badge')).toBeVisible();
```

Add focused flows for Edit note (textarea receives focus), View in 3D at a later photo, batch download/delete, wall rename/PDF/open, trash restore/purge and readonly disabled writes.
2. Run context tests. Expected: no context menu.
3. Implement a single document menu with `role=menu` / `role=menuitem`, fixed positioning clamped after measurement, bounded max-height, separators and `data-write`. Keyboard navigation skips disabled items, Enter activates, Escape returns focus to opener; capture/stop keyboard events while open. Outside pointer, blur, resize, scroll and cleanup close it. Do not intercept editable text or nonempty text selections. Only bind on computers with fine pointers.
4. Photo groups, in order:
   - Open, View in 3D.
   - Set as album cover, Edit note.
   - Copy to album, Move to album, Download original.
   - Delete.
   Selected-item menu instead operates on the full selected ID snapshot. Refactor transfer/delete to accept an explicit ID list with the current selection as default; reuse confirmations and mutation/license guards.
5. `startIndex` is passed to existing `build(startIndex)` / `startSpread` logic. `editNote()` opens details then clicks the existing note-edit button; no parallel note editor.
6. Wall groups: Open, 3D / Rename, PDF (computer) / Delete album. Reuse existing wall actions through a shared local action function. Trash groups: Restore, Delete permanently, both call `operate`.
7. Run context tests plus collection-v2, lightbox-v2, photo-notes, trash and book-pages specs. Expected: pass. Commit `feat: add accessible photo album and trash context menus`.

### Task 4: Documentation, verification and delivery

**Files:** README and session evidence.

1. Document native menus, hidden Windows menu bar, keyboard-help access, context-menu groups and readonly behavior.
2. Run `npm test && npm run build && npm run test:desktop`, logs in the plan workspace. Expected: zero failing tests; platform-specific skips remain.
3. Capture context menus and shortcuts in zh-light/en-dark. Check photo menu keyboard focus, separators, edge clamping and readable disabled actions against item 9 mockups.
4. Generate review package from `698bcc6`; dispatch one fresh whole-branch reviewer with the five Review Focus items and ledger rulings. Fix Important/Critical findings via failing tests in one pass; record deferred minors.
5. Commit all changes. Push only the feature branch, create the PR against S4a while unmerged or main once S4a lands, and check Windows/macOS CI. Do not merge automatically.

## Self-review

- §6.2 is covered by Task 3 plus native text roles in Task 1.
- §6.3 and remaining §6.4 command bridge are covered by Tasks 1–2.
- §8 guards and errors are shared with existing actions; menu callbacks catch errors and display existing failure toasts.
- Shared interfaces: T1 context/command contract → T2; T2 page commands remain independent of T3 context menu; T3 startIndex/editNote are consumed only by the album page.
- No new dependency, no unresolved product choice. The previously approved full spec and repeated requests to continue preserve inline execution.
