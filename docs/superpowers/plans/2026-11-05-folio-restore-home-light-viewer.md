# Restore Home and Desktop Photo Details

> **For agentic workers:** Implement inline with `executing-plans`, using TDD and one whole-branch review. Track task status in SQL and the plan-scoped execution ledger.

**Goal:** Restore the original home as the landing page and the original left-photo/right-details layout on computers, without changing phone viewing.

**Architecture:** Keep the existing router, album viewer, details/note modules and delegated actions. Restore the removed home and its licensed assets; use responsive markup and theme tokens for desktop details rather than replacing viewer behavior.

**Tech stack:** Existing JavaScript, CSS, Vite, Node.js, Electron and Playwright. No new dependencies.

**Spec:** The user approved both default choices in the home/light-details comparison: `首页：默认；照片详情：默认`. This approved brief supersedes conflicting home-removal and desktop-fullscreen decisions in the existing polish/v2 specifications.

## Global Constraints

- Start on the home page; retain Home / Albums tabs and Settings. Logo links to `#/`.
- Restore home content and assets from `a0ed40b`, mapping its typography/radii to existing tokens, except the 52px/34px display title.
- At widths >=861px: 64px bar, left photo frame, 370px right details card, default-open details with independent desktop persistence, theme-aware colors.
- Desktop bar: back to album, brand, album name, count, previous/next, Details. Card: delete beside the name, Download original and Set as album cover below.
- Do not show a desktop filmstrip or add copy/move buttons. Keep those operations on the album page.
- At widths <=860px: preserve the dark viewer, filmstrip, top-bar actions and bottom details sheet.
- Preserve photo/video labels, readonly permissions, trash preview, notes, zoom/pan/minimap, keyboard and native window chrome.
- Download remains a download; do not restore the old new-window action.
- Work only in this isolated branch. Open a PR to main after verification/review; do not merge.

## Review Focus

- Old v2 closed-details storage must not hide the newly restored desktop card.
- Resizing across 860/861px while editing a note must not discard text or bypass leave protection.
- Long filenames and expanded metadata must not cause horizontal overflow or hide the photo.
- Switching photo/video must update every download action's visible and accessible names.
- Readonly and trash views must retain valid controls without exposing mutations.

## Task 1: Home Route and Desktop Command Context

**Files:** `src/router.js`, `src/router.test.js`, `shared/commands.js`, `shared/commands.test.js`.

**Interfaces:** `parse(hash)` continues to return `{ page, album, three, photo }`; adds `home` without changing known album/trash/license addresses. `normalizeContext(value)` accepts `home` with the same validated preference fields.

1. Replace redirect assertions with home fallback and known-route assertions. Add a home command-context case:

   ```js
   assert.deepEqual(parse('#/'), { page: 'home', album: null, three: false, photo: null });
   assert.equal(parse('#/albums').page, 'albums');
   const home = normalizeContext({ page: 'home', busy: false, appearance: 'auto', density: 'm' });
   assert.equal(commandAllowed('new-album', home, true), true);
   assert.equal(commandAllowed('import-folder', home, true), true);
   assert.equal(commandAllowed('add-photos', home, true), false);
   assert.equal(commandAllowed('density-l', home, true), false);
   ```

2. Run `node --test src/router.test.js shared/commands.test.js`.
   Expected RED: fallback remains `albums`, home context is rejected.
3. Implement explicit `#/albums`, home fallback, and home context support. Remove only the obsolete canonical redirect; preserve history/query handling.
4. Run the same command. Expected GREEN: all route/command cases pass.
5. Commit as `feat: restore home route and command context`, with the Copilot trailer.

## Task 2: Original Home and Navigation

**Files:** `src/home.js`, `src/main.js`, `src/nav.js`, `src/style.css`, `src/folder.js`, `src/i18n.js`, `src/collection-text.js`, `src/ui.js`, `src/assets/home-book.jpg`, `src/assets/home-book.mp4`, `licenses/components.json`, `ASSET_PROVENANCE.txt`, `scripts/verify-package.mjs`, `scripts/package-smoke.mjs`, `e2e/home.spec.cjs`, affected landing-page tests.

**Interfaces:** `renderHome(app)` returns a destroyable view like `renderWall`; `createNav().update(page)` marks the active route; `folder(album, { heading })` keeps h2 by default and supports h3 for recent albums.

1. Add real Electron cases for launch/unknown-address home, query preservation, nav state, reduced-motion poster, recent nonempty albums/statistics, and new-album command from Home.
2. Build the unchanged UI and run `npx playwright test e2e/home.spec.cjs`.
   Expected RED: home content/tabs absent, launch still renders the wall.
3. Restore home content/assets from `a0ed40b`, integrate current cards/date formatting and heading levels, restore translations/icons, and wire routing/navigation. Keep Settings and existing permissions.
4. Restore asset provenance and package/range checks. Change existing tests that exercise the wall to navigate there explicitly, rather than assuming it is the landing page.
5. Run `npm run build && npx playwright test e2e/home.spec.cjs e2e/settings.spec.cjs e2e/desktop-menus.spec.cjs e2e/welcome-import.spec.cjs`.
   Expected GREEN: home and directly affected existing flows pass.
6. Commit as `feat: restore the original Folio home page`, with the Copilot trailer.

## Task 3: Desktop Light Photo Details

**Files:** `src/lightbox.js`, `src/photo-details.js`, `src/photo-view.css`, `src/lightbox-zoom.js`, `src/lightbox-filmstrip.js`, `e2e/lightbox-v2.spec.cjs`, `e2e/photo-details.spec.cjs`, `e2e/photo-notes.spec.cjs`, `e2e/accessibility.spec.cjs`, affected viewer-action tests.

**Interfaces:** Existing viewer action names and details API remain. `lightbox-details-desktop` defaults to open; existing `lightbox-details` continues to govern phones. Controls live in `.lb-preview`, which still covers the phone viewport.

1. Update desktop viewer tests to assert the visible card, no overlay, no desktop filmstrip, card actions and theme colors. Add storage/resize, download-label, long-name and note-protection regressions:

   ```js
   await expect(page.locator('.lb-details')).toBeVisible();
   const stage = await page.locator('.lb-preview').boundingBox();
   const card = await page.locator('.lb-details').boundingBox();
   expect(stage.x + stage.width).toBeLessThan(card.x);
   await expect(page.locator('.lb-filmstrip')).toBeHidden();
   await page.locator('.lb-details [data-act=original]').click();
   ```

   Use a real download event for the download case, existing mixed-media fixtures for labels, and existing note dialog protection for the resize/edit case.
2. Run `npx playwright test e2e/lightbox-v2.spec.cjs e2e/photo-details.spec.cjs e2e/photo-notes.spec.cjs`.
   Expected RED: old viewer defaults to closed, has a floating card/visible filmstrip and lacks card download.
3. Implement stable responsive markup, card actions, independent desktop preferences and default-open behavior. Keep async metadata cancellation and note guards.
4. Implement theme-token desktop CSS and the framed/height-limited image area. Move zoom/minimap/filmstrip inside preview without changing algorithms; preserve phone CSS and native chrome padding.
5. Adapt existing viewer tests to the new desktop actions or explicit phone layout where they exercise phone features. Keep permissions, video, trash and keyboard assertions.
6. Run `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs e2e/photo-details.spec.cjs e2e/photo-notes.spec.cjs e2e/accessibility.spec.cjs e2e/video-playback.spec.cjs e2e/collection-v2.spec.cjs`.
   Expected GREEN: desktop restoration and existing phone/media/permission behavior pass.
7. Commit as `feat: restore desktop photo detail layout`, with the Copilot trailer.

## Task 4: Documentation and Integration Verification

**Files:** `README.md`, `docs/superpowers/specs/2026-11-03-folio-polish-design.md`, existing v2 design specification, directly dependent tests found by the full suite.

**Interfaces:** Documentation describes the approved defaults, not the discarded comparison options.

1. Update home/routing, desktop details/action placement, responsive differences and token guidance. Do not retain contradictory default-fullscreen or no-home requirements.
2. Run `caffeinate -di sh -c 'npm test && npm run build && npm run test:desktop && git diff --check'`.
   Expected: all existing checks pass; investigate failures without increasing business timeouts or skipping assertions.
3. Capture real screenshots in Chinese/English, light/dark, desktop/phone, including 860/861px and a small desktop window; compare with the approved draft.
4. Commit as `docs: describe restored home and desktop photo details`, with the Copilot trailer.
5. Obtain one fresh whole-branch review. Reproduce/fix important findings test-first, then verify the affected suite and full checks as needed.
6. Push the feature branch as the authorized repository account, open a PR to main and observe CI. Do not merge or publish a release.
