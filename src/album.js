import { api, mediaUrl } from './api.js';
import { openLightbox } from './lightbox.js';
import { close, open, swap } from './router.js';
import { backLink, dialog, icon, toast } from './ui.js';
import { lang, mediaCountText, t } from './i18n.js';
import { allowWrite, canWrite } from './license.js';
import { createImporter } from './import-files.js';
import { collectDrop } from './folder-files.js';
import { formatDuration, mediaCounts } from '../shared/media.js';
import { c } from './collection-text.js';
import { formatRange } from '../shared/dates.js';
import { chooseAlbum, downloadPhotos } from './collection-actions.js';
import { showUndo } from './undo.js';
import { onComputer } from './phone.js';

const fine = matchMedia('(pointer: fine)');
const DENSITY = ['s', 'm', 'l'];
// Rough aspect ratios, so the placeholder rows look like photos.
const SKELETON = [1.5, 0.75, 1.33, 1, 1.5, 0.75, 1.33, 1.5].map((a) => `<i class="skel" style="--a:${a}" aria-hidden="true"></i>`).join('');

function savedDensity() {
  try {
    const value = localStorage.getItem('density');
    return DENSITY.includes(value) ? value : 'm';
  } catch {
    return 'm';
  }
}

export function renderAlbum(app, id) {
  let album = null;
  let alive = true;
  let route = { album: id, three: false, photo: null };
  let selecting = false;
  const selected = new Set();
  let drag = null;
  let suppressClick = false;
  let mutating = false;
  let query = '';
  let anchor = null;
  let longPress = null;
  let lightbox = null;
  let viewer = null;
  let viewerLoading = false;

  app.innerHTML = `
    <main class="page album-page">
      ${backLink()}
      <h1 class="t1"><button class="title" type="button" data-write data-act="rename" title="${t('rename-hint')}"></button><span class="pen">${icon('pen')}</span></h1>
      <p class="sub count"></p>
      <div class="acts normal">
        <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>${t('flip-3d')}</span></button>
        <button class="btn" type="button" data-write data-act="upload">${icon('upload')}<span>${t('upload')}</span></button>
        <button class="btn" type="button" data-act="select">${icon('select')}<span>${t('select')}</span></button>
        <span class="menu-host"><button class="btn only-icon" type="button" data-act="menu" aria-label="${t('more')}" aria-haspopup="menu">${icon('more')}</button></span>
        <button class="btn only-icon" type="button" data-act="search" aria-label="${c('searchPhotos')}">${icon('search')}</button>
        <input class="album-search" type="search" aria-label="${c('searchPhotos')}" placeholder="${c('searchPhotos')}" hidden>
        <label class="sort-label"><span>${c('sortBy')}</span><select class="photo-sort" data-write>${['taken', 'added', 'manual'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select></label>
        <label class="density" title="${t('density')}">${icon('gridSmall')}<input type="range" min="0" max="2" step="1" aria-label="${t('density')}">${icon('gridLarge')}</label>
      </div>
      <div class="acts picking" hidden>
        <button class="btn" type="button" data-act="all">${c('all')}</button>
        <button class="btn ghost" type="button" data-act="cancel">${c('done')}</button>
      </div>
      <div class="batch-bar" hidden role="group" aria-label="${t('select')}">
        <span class="picked"></span>
        <button class="btn" type="button" data-write data-act="move" aria-label="${c('move')}">${icon('move')}<span>${c('move')}</span></button>
        <button class="btn batch-copy" type="button" data-write data-act="copy" aria-label="${c('copy')}">${icon('copy')}<span>${c('copy')}</span></button>
        <button class="btn" type="button" data-act="download" aria-label="${c('download')}">${icon('download')}<span>${c('download')}</span></button>
        <button class="btn danger" type="button" data-write data-act="delete" aria-label="${t('delete')}">${icon('trash')}<span>${t('delete')}</span></button>
        <button class="ibtn" type="button" data-act="cancel" aria-label="${c('done')}">${icon('close')}</button>
      </div>
      <div class="grid">${SKELETON}</div>
      <div class="empty search-empty" hidden><p>${c('noResults')}</p><button class="btn" data-act="clear-search" type="button">${c('clear')}</button></div>
      <div class="drop" hidden>
        ${icon('upload')}
        <b>${t('drop-here')}</b>
        <span>${t('or')} <button class="link" type="button" data-write data-act="upload">${t('choose-photos')}</button></span>
        <small>${t('formats')}</small>
      </div>
      <div class="fab">
        <button class="btn" type="button" data-write data-act="upload">${icon('upload')}<span>${t('upload')}</span></button>
        <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>${t('flip-3d')}</span></button>
      </div>
      <input type="file" data-write accept="image/*,.heic,.heif,video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v" multiple hidden>
    </main>`;
  const $ = (s) => app.querySelector(s);
  const main = $('.page');
  const grid = $('.grid');
  const input = $('input[type=file]');
  const density = $('.density input');
  const importer = createImporter(main, { beforeFile: () => album, onPhoto: addedPhoto, onDone: load });
  main.dataset.density = savedDensity();
  density.value = String(DENSITY.indexOf(main.dataset.density));
  density.addEventListener('input', () => {
    main.dataset.density = DENSITY[Number(density.value)];
    try { localStorage.setItem('density', main.dataset.density); } catch {}
  });
  $('.album-search').addEventListener('input', (event) => {
    query = event.target.value.trim().toLocaleLowerCase();
    if (album) render();
  });
  $('.photo-sort').addEventListener('change', async (event) => {
    if (!allowWrite() || importer.active || mutating) {
      event.target.value = album?.sort ?? 'manual';
      if (importer.active || mutating) toast(c('busy'));
      return;
    }
    mutating = true;
    try { changed(await api.updateAlbum(id, { sort: event.target.value })); }
    catch (error) {
      event.target.value = album?.sort ?? 'manual';
      toast(t('failed', { reason: error.message }));
    } finally { mutating = false; }
  });

  async function load() {
    try {
      const next = await api.album(id);
      if (!alive || drag || mutating) return; // keep the current drag or mutation snapshot intact
      const same = album && JSON.stringify(next) === JSON.stringify(album);
      album = next;
      if (!same) render();
      sync();
    } catch (err) {
      if (!alive) return;
      if (err.status === 404) main.innerHTML = `<p class="empty">${t('album-missing')}<a href="#/albums">${t('back-to-albums')}</a></p>`;
      else {
        grid.querySelectorAll('.skel').forEach((node) => node.remove());
        toast(t('load-failed', { reason: err.message }));
      }
    }
  }

  const base = () => `#/a/${id}${route.three ? '/3d' : ''}`;

  // The lightbox changed the album (cover, deletion): redraw what lies under it.
  function changed(next) {
    if (!alive) return;
    album = next;
    render();
    viewer?.refresh(next);
  }

  // Opens or closes the 3D book and the lightbox to match the address.
  function sync() {
    if (route.three && !album.photos.length) {
      route = { ...route, three: false, photo: null };
      swap(`#/a/${id}`);
    }
    if (route.three && !viewer && !viewerLoading) {
      viewerLoading = true;
      import('./viewer.js').then(({ openViewer }) => {
        viewerLoading = false;
        if (!alive || !route.three || viewer) return;
        viewer = openViewer({
          album,
          onOpenPhoto: (i) => open(`#/a/${id}/3d/p/${album.photos[i].id}`),
          onClose: () => close(`#/a/${id}`),
          onPerPage: (perPage) =>
            api.updateAlbum(id, { perPage }).then(
              (next) => (album = next),
              (err) => toast(t('save-failed', { reason: err.message })),
            ),
        });
      });
    } else if (!route.three && viewer) {
      viewer.close();
      viewer = null;
    }
    const i = route.photo ? album.photos.findIndex((p) => p.id === route.photo) : -1;
    if (i >= 0 && lightbox) lightbox.show(i, album);
    else if (i >= 0) {
      lightbox = openLightbox({
        album,
        index: i,
        onIndex: (pid) => {
          route = { ...route, photo: pid };
          swap(`${base()}/p/${pid}`);
        },
        onAlbum: changed,
        onClose: () => close(base()),
      });
    } else {
      lightbox?.close();
      lightbox = null;
      if (route.photo) swap(base()); // a photo that no longer exists
    }
  }

  function tile(p, isCover) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile';
    el.dataset.id = p.id;
    el.style.setProperty('--a', (p.w / p.h).toFixed(4));
    el.classList.toggle('sel', selected.has(p.id));
    el.innerHTML = `<img alt="" loading="lazy" draggable="false" src="${mediaUrl(id, p.id, 600)}">${isCover ? `<span class="badge">${t('cover')}</span>` : ''}<span class="chk">${icon('check')}</span>`;
    if (p.kind === 'video') {
      el.classList.add('tile-video');
      const badge = document.createElement('span');
      badge.className = 'video-badge';
      badge.innerHTML = icon('play');
      badge.append(document.createTextNode(formatDuration(p.duration)));
      el.append(badge);
      el.setAttribute('aria-label', `${p.name} · ${t('video')} · ${formatDuration(p.duration)}`);
    } else el.setAttribute('aria-label', p.name);
    el.querySelector('img').onerror = () => el.classList.add('missing');
    return el;
  }

  // The count and the capture dates under the title (polish spec §4.3).
  function countText() {
    const dates = formatRange(album.dateRange?.from, album.dateRange?.to, { lang: lang() });
    return [mediaCountText(mediaCounts(album.photos)), dates].filter(Boolean).join(' · ');
  }

  function render() {
    const n = album.photos.length;
    $('.title').textContent = album.title;
    $('.count').textContent = countText();
    $('.photo-sort').value = album.sort ?? 'manual';
    document.title = `${album.title} · ${t('app')}`;
    $('.drop').hidden = n > 0;
    grid.hidden = n === 0;
    $('.density').hidden = n === 0;
    for (const b of app.querySelectorAll('[data-act=select], [data-act="3d"]')) b.disabled = n === 0;
    const cover = album.cover ?? album.photos[0]?.id;
    for (const pid of selected) if (!album.photos.some((p) => p.id === pid)) selected.delete(pid);
    const visible = visiblePhotos();
    grid.hidden = visible.length === 0;
    $('.search-empty').hidden = !query || visible.length > 0;
    grid.replaceChildren(...visible.map((p) => tile(p, p.id === cover)));
    renderPicking();
  }

  function renderPicking() {
    main.classList.toggle('selecting', selecting);
    $('.acts.normal').hidden = selecting;
    $('.acts.picking').hidden = !selecting;
    $('.batch-bar').hidden = !selecting;
    $('.picked').textContent = t('selected', { n: selected.size });
    for (const button of app.querySelectorAll('.batch-bar [data-act]:not([data-act=cancel])')) button.disabled = selected.size === 0 || mutating;
  }

  function visiblePhotos() {
    return album.photos.filter((p) => !query || `${p.name}\n${p.note ?? ''}`.toLocaleLowerCase().includes(query));
  }

  // Files from the file input or a drop join the import queue (import-files.js).
  function enqueue(files, { notMedia = 0, unreadable = 0 } = {}) {
    if (!allowWrite()) return;
    if (mutating || (document.documentElement.hasAttribute('data-busy') && !importer.active)) { toast(c('busy')); return; }
    const list = [...files];
    if ((!list.length && !notMedia && !unreadable) || !album) return;
    importer.add({ album: id, files: list, notMedia, unreadable });
  }

  async function refreshAfterUpload(signal) {
    while (alive) {
      const before = album;
      const next = await api.album(id, { signal });
      if (!alive) return;
      if (album !== before) continue;
      if (next?.id !== id || !Array.isArray(next.photos)) throw new Error('Invalid album response');
      album = next;
      render();
      return;
    }
  }

  // A photo has been added: show its tile, or reload when the album changed meanwhile or is sorted
  // or searched. Returns a note for the import summary when that reload fails.
  async function addedPhoto(photo, { signal, before }) {
    if (!alive) return;
    let note;
    if (!album.photos.some((item) => item.id === photo.id)) {
      if (album !== before || (album.sort && album.sort !== 'manual') || query) {
        try { await refreshAfterUpload(signal); }
        catch (error) {
          if (!alive || error.name === 'AbortError') throw error;
          note = t('upload-refresh-failed');
        }
      } else {
        album = { ...album, photos: [...album.photos, photo] };
        if (album.photos.length === 1) render();
        else grid.append(tile(photo, false));
      }
    } else render();
    if (alive) $('.count').textContent = countText();
    return note;
  }

  async function removeSelected() {
    if (!allowWrite()) return;
    if (importer.active || mutating) { toast(c('busy')); return; }
    const text = t('delete-photos-text', { n: selected.size });
    if (!(await dialog({ title: t('delete-photos'), text, ok: t('delete'), danger: true }))) return;
    if (!alive || !allowWrite() || importer.active || mutating) return;
    mutating = true;
    renderPicking();
    try {
      album = await api.deletePhotos(id, [...selected]);
      if (!alive) return;
      selecting = false;
      selected.clear();
      render();
      showUndo(album.trashId, load);
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    } finally { mutating = false; if (alive) renderPicking(); }
  }

  async function rename() {
    if (!allowWrite()) return;
    const title = await dialog({ title: t('rename-album'), value: album.title, ok: t('save') });
    if (!title || title === album.title) return;
    try {
      album = await api.updateAlbum(id, { title });
      $('.title').textContent = album.title;
      document.title = `${album.title} · ${t('app')}`;
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    }
  }

  function toggleMenu(button) {
    const shown = button.parentElement.querySelector('.menu');
    if (shown) return shown.remove();
    button.insertAdjacentHTML(
      'afterend',
      `<div class="menu" role="menu"><button type="button" role="menuitem" data-write data-act="rename">${t('rename')}</button>${onComputer ? `<button type="button" role="menuitem" data-act="pdf">${c('pdf')}</button>` : ''}<button type="button" role="menuitem" data-write class="red" data-act="delete-album">${t('delete-album')}</button></div>`,
    );
  }

  async function removeAlbum() {
    if (!allowWrite()) return;
    if (importer.active || mutating) { toast(t('upload-wait')); return; }
    const text = t('delete-album-text', { name: album.title });
    if (!(await dialog({ title: t('delete-album'), text, ok: t('delete'), danger: true })) || !alive) return;
    // An import may have started while the confirmation was open.
    if (importer.active || mutating) { toast(t('upload-wait')); return; }
    try {
      mutating = true;
      const result = await api.deleteAlbum(id);
      showUndo(result.trashId);
      mutating = false;
      if (alive) open('#/albums');
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    } finally { mutating = false; }
  }

  function onTile(t, event) {
    if (suppressClick) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) selecting = true;
    if (!selecting) return open(`#/a/${id}/p/${t.dataset.id}`);
    const pid = t.dataset.id;
    if (event.shiftKey && anchor) {
      const order = visiblePhotos().map((p) => p.id);
      const a = order.indexOf(anchor);
      const b = order.indexOf(pid);
      if (a >= 0 && b >= 0) for (const id of order.slice(Math.min(a, b), Math.max(a, b) + 1)) selected.add(id);
    } else if (selected.has(pid)) selected.delete(pid);
    else selected.add(pid);
    anchor = pid;
    for (const tile of grid.children) tile.classList.toggle('sel', selected.has(tile.dataset.id));
    renderPicking();
  }

  async function transfer(mode) {
    if (!allowWrite() || importer.active || mutating || !selected.size) { if (importer.active || mutating) toast(c('busy')); return; }
    try {
      const target = await chooseAlbum(id, mode);
      if (!target || !alive || !allowWrite()) return;
      if (importer.active || mutating) { toast(c('busy')); return; }
      mutating = true;
      document.documentElement.setAttribute('data-busy', '');
      renderPicking();
      const result = await api.transferPhotos(id, [...selected], target.id, target.mode);
      if (!alive) return;
      album = result.album;
      selected.clear();
      selecting = false;
      render();
      toast(c('transferred', { n: result.copied, skipped: result.skipped }));
    } catch (error) { toast(t('failed', { reason: error.message })); }
    finally {
      mutating = false;
      document.documentElement.removeAttribute('data-busy');
      if (alive) renderPicking();
    }
  }

  function selectAll() {
    selecting = true;
    for (const p of visiblePhotos()) selected.add(p.id);
    render();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act !== 'menu') app.querySelector('.acts .menu')?.remove();
    if (['upload', 'rename', 'delete', 'delete-album'].includes(act) && !allowWrite()) return;
    const tile = e.target.closest('.tile');
    if (tile && !act) return onTile(tile, e);
    if (!album) return;
    if (act === 'upload') input.click();
    else if (act === 'select' || act === 'cancel') {
      selecting = act === 'select';
      selected.clear();
      render();
    } else if (act === 'delete') removeSelected();
    else if (act === 'all') selectAll();
    else if (act === 'move' || act === 'copy') transfer(act);
    else if (act === 'download') downloadPhotos(album, [...selected]).catch((error) => toast(t('failed', { reason: error.message })));
    else if (act === 'search') { $('.album-search').hidden = !$('.album-search').hidden; if (!$('.album-search').hidden) $('.album-search').focus(); }
    else if (act === 'clear-search') { query = ''; $('.album-search').value = ''; render(); }
    else if (act === 'pdf') import('./pdf-export.js').then(({ openPdfExport }) => openPdfExport(album)).catch((error) => toast(t('failed', { reason: error.message })));
    else if (act === 'rename') rename();
    else if (act === 'menu') toggleMenu(e.target.closest('[data-act=menu]'));
    else if (act === 'delete-album') removeAlbum();
    else if (act === '3d') open(`#/a/${id}/3d`);
  }

  // Desktop reordering with the pointer (spec §9): a ghost follows, the others make room.
  function onPointerDown(e) {
    const t = e.target.closest('.tile');
    if (t && e.pointerType !== 'mouse') {
      clearTimeout(longPress?.timer);
      const timer = setTimeout(() => {
        selecting = true;
        selected.add(t.dataset.id);
        anchor = t.dataset.id;
        suppressClick = true;
        render();
      }, 500);
      longPress = { timer, x: e.clientX, y: e.clientY };
    }
    if (!t || selecting || !fine.matches || e.button !== 0 || !canWrite()) return;
    if (query || importer.active || mutating || e.pointerType === 'touch') return;
    drag = { t, x0: e.clientX, y0: e.clientY, mx: -Infinity, my: -Infinity, ghost: null, before: '' };
  }

  function onPointerMove(e) {
    if (longPress && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > 9) clearTimeout(longPress.timer);
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      if (album.sort && album.sort !== 'manual') {
        drag = null;
        suppressClick = true;
        dialog({ title: c('manualPrompt'), ok: c('manual') }).then(async (yes) => {
          if (!yes || !alive || !allowWrite() || importer.active || mutating) return;
          changed(await api.updateAlbum(id, { sort: 'manual' }));
          toast(c('manualHint'));
        }).catch((error) => toast(t('failed', { reason: error.message })));
        return;
      }
      const r = drag.t.getBoundingClientRect();
      drag.dx = drag.x0 - r.left;
      drag.dy = drag.y0 - r.top;
      drag.before = [...grid.children].map((x) => x.dataset.id).join();
      drag.ghost = drag.t.cloneNode(true);
      drag.ghost.classList.add('ghost');
      Object.assign(drag.ghost.style, { width: `${r.width}px`, height: `${r.height}px` });
      document.body.append(drag.ghost);
      drag.t.classList.add('dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-3deg)`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile');
    // Rows re-flow after each move, so the next move waits until the pointer has gone 24 px further.
    if (over && over !== drag.t && over.parentElement === grid && Math.hypot(e.clientX - drag.mx, e.clientY - drag.my) >= 24) {
      const kids = [...grid.children];
      if (kids.indexOf(over) > kids.indexOf(drag.t)) over.after(drag.t);
      else over.before(drag.t);
      drag.mx = e.clientX;
      drag.my = e.clientY;
    }
    if (e.clientY < 60) scrollBy(0, -16);
    else if (e.clientY > innerHeight - 60) scrollBy(0, 16);
  }

  async function onPointerUp() {
    clearTimeout(longPress?.timer);
    longPress = null;
    if (suppressClick) setTimeout(() => { suppressClick = false; });
    const d = drag;
    drag = null;
    if (!d?.ghost) return;
    d.ghost.remove();
    d.t.classList.remove('dragging');
    suppressClick = true; // the click that follows this pointerup is not a tap
    setTimeout(() => (suppressClick = false));
    const order = [...grid.children].map((x) => x.dataset.id);
    if (order.join() === d.before) return;
    if (!allowWrite()) { void load(); return; }
    try {
      album = await api.updateAlbum(id, { order });
      render(); // the cover badge follows the first photo
    } catch (err) {
      toast(err.status === 409 ? t('order-changed') : t('failed', { reason: err.message }));
      load();
    }
  }

  // Files dragged in from the desktop are uploaded (HTML5 drag and drop).
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  function onDragOver(e) {
    if (!hasFiles(e) || !album) return;
    e.preventDefault();
    main.classList.add('dropping');
    clearTimeout(main.dropTimer);
    main.dropTimer = setTimeout(() => main.classList.remove('dropping'), 150);
  }
  // Dropped folders add what is inside them, at any depth, to this album (polish spec §5).
  async function onDrop(e) {
    if (!hasFiles(e) || !album) return;
    e.preventDefault();
    main.classList.remove('dropping');
    if (!allowWrite()) return;
    const { folders, loose } = await collectDrop(e.dataTransfer); // takes the items before it awaits
    if (!alive) return;
    const groups = [loose, ...folders];
    const files = groups.flatMap((group) => group.files);
    const unreadable = groups.reduce((n, group) => n + group.unreadable, 0);
    if (!files.length && !unreadable && folders.length) {
      toast(t('folder-empty', { names: folders.map((group) => group.name) }));
      return;
    }
    enqueue(files, { notMedia: groups.reduce((n, group) => n + group.skipped, 0), unreadable });
  }

  const onFocus = () => {
    if (!importer.active && !mutating && !drag && !viewer) load();
  };
  const refreshTimer = setInterval(() => {
    if (album?.sort === 'taken' && !document.hidden && !document.querySelector('dialog[open]')) onFocus();
  }, 5000);
  function onKey(event) {
    if (event.target.closest?.('input, textarea, select, [contenteditable=true]') || document.querySelector('.lb, .ab, dialog[open]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && album) {
      event.preventDefault();
      selectAll();
    } else if (event.key === 'Escape') {
      app.querySelector('.menu')?.remove();
      selecting = false;
      selected.clear();
      if (album) render();
    } else if (selecting && selected.size && ['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      void removeSelected();
    }
  }
  input.addEventListener('change', () => {
    enqueue(input.files);
    input.value = '';
  });
  grid.addEventListener('pointerdown', onPointerDown);
  app.addEventListener('click', onClick);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  window.addEventListener('focus', onFocus);
  window.addEventListener('keydown', onKey);
  window.addEventListener('folio-library-changed', onFocus);
  load();

  return {
    canLeave(next, again) {
      if ((importer.active || mutating) && (again || next.album !== id)) { toast(c('busy')); return false; }
      if (!again && next.album === id && next.photo === route.photo) return true;
      return lightbox?.canLeave() ?? true;
    },
    update(next) {
      route = next;
      if (album) sync();
    },
    destroy() {
      alive = false;
      importer.destroy();
      clearInterval(refreshTimer);
      clearTimeout(longPress?.timer);
      viewer?.close();
      lightbox?.close();
      drag?.ghost?.remove();
      app.removeEventListener('click', onClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('folio-library-changed', onFocus);
    },
  };
}
