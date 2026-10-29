import { api, mediaUrl } from './api.js';
import { openLightbox } from './lightbox.js';
import { close, open, swap } from './router.js';
import { dialog, icon, toast } from './ui.js';
import { t } from './i18n.js';
import { allowWrite, canWrite } from './license.js';

const fine = matchMedia('(pointer: fine)');
const SKIP = { duplicate: 'dup', unsupported: 'bad', 'too-large': 'big' };

export function renderAlbum(app, id) {
  let album = null;
  let alive = true;
  let route = { album: id, three: false, photo: null };
  let selecting = false;
  const selected = new Set();
  let drag = null;
  let suppressClick = false;
  const queue = [];
  const tally = { total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 };
  let uploading = false;
  let lightbox = null;
  let viewer = null;
  let viewerLoading = false;

  app.innerHTML = `
    <main class="page album-page">
      <p class="crumb"><a href="#/albums">${t('albums')}</a><span>/</span></p>
      <h1 class="t1"><button class="title" type="button" data-write data-act="rename" title="${t('rename-hint')}"></button><span class="pen">${icon('pen')}</span></h1>
      <p class="sub count"></p>
      <div class="acts normal">
        <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>${t('flip-3d')}</span></button>
        <button class="btn" type="button" data-write data-act="upload">${icon('upload')}<span>${t('upload-photos')}</span></button>
        <button class="btn" type="button" data-act="select">${t('select')}</button>
      </div>
      <div class="acts picking" hidden>
        <button class="btn ghost" type="button" data-act="cancel">${t('cancel')}</button>
        <span class="picked"></span>
        <button class="btn danger" type="button" data-write data-act="delete">${icon('trash')}<span>${t('delete')}</span></button>
      </div>
      <div class="grid" hidden></div>
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
      <input type="file" data-write accept="image/*,.heic,.heif" multiple hidden>
      <div class="upload" hidden><div class="r"><b></b><span></span></div><div class="prog"><i></i></div><small></small></div>
    </main>`;
  const $ = (s) => app.querySelector(s);
  const main = $('.page');
  const grid = $('.grid');
  const input = $('input[type=file]');
  const box = $('.upload');

  async function load() {
    try {
      const next = await api.album(id);
      if (!alive || drag) return; // re-rendering mid-drag would swap the tiles out from under the pointer
      const same = album && JSON.stringify(next) === JSON.stringify(album);
      album = next;
      if (!same) render();
      sync();
    } catch (err) {
      if (!alive) return;
      if (err.status === 404) main.innerHTML = `<p class="empty">${t('album-missing')}<a href="#/albums">${t('back-to-albums')}</a></p>`;
      else toast(t('load-failed', { reason: err.message }));
    }
  }

  const base = () => `#/a/${id}${route.three ? '/3d' : ''}`;

  // The lightbox changed the album (cover, deletion): redraw what lies under it.
  function changed(next) {
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
    el.querySelector('img').onerror = () => el.classList.add('missing');
    return el;
  }

  function render() {
    const n = album.photos.length;
    $('.title').textContent = album.title;
    $('.count').textContent = t('photos', { n });
    document.title = `${album.title} · ${t('app')}`;
    $('.drop').hidden = n > 0;
    grid.hidden = n === 0;
    for (const b of app.querySelectorAll('[data-act=select], [data-act="3d"]')) b.disabled = n === 0;
    const cover = album.cover ?? album.photos[0]?.id;
    for (const pid of selected) if (!album.photos.some((p) => p.id === pid)) selected.delete(pid);
    grid.replaceChildren(...album.photos.map((p) => tile(p, p.id === cover)));
    renderPicking();
  }

  function renderPicking() {
    main.classList.toggle('selecting', selecting);
    $('.acts.normal').hidden = selecting;
    $('.acts.picking').hidden = !selecting;
    $('.picked').textContent = t('selected', { n: selected.size });
    $('.acts.picking [data-act=delete]').disabled = selected.size === 0;
  }

  // Uploads go one at a time (spec §7); files added meanwhile join the same run.
  function enqueue(files) {
    if (!allowWrite()) return;
    const list = [...files];
    if (!list.length || !album) return;
    queue.push(...list);
    tally.total += list.length;
    if (!uploading) pump();
  }

  async function pump() {
    uploading = true;
    document.documentElement.setAttribute('data-busy', '');
    box.hidden = false;
    clearTimeout(box.timer);
    box.querySelector('small').textContent = '';
    while (queue.length && alive) {
      const file = queue.shift();
      const i = tally.total - queue.length;
      box.querySelector('b').textContent = t('importing', { i, n: tally.total });
      box.querySelector('.r span').textContent = file.name;
      box.querySelector('.prog i').style.width = `${((i - 1) / tally.total) * 100}%`;
      try {
        const res = await api.upload(id, file);
        if (res.photo) {
          tally.done++;
          album = { ...album, photos: [...album.photos, res.photo] };
          if (album.photos.length === 1) render();
          else grid.append(tile(res.photo, false));
          $('.count').textContent = t('photos', { n: album.photos.length });
        } else tally[SKIP[res.skipped]]++;
      } catch {
        tally.fail++;
      }
    }
    uploading = false;
    document.documentElement.removeAttribute('data-busy');
    if (!alive) return;
    const skipped = tally.dup + tally.bad + tally.big;
    const why = [tally.dup && t('dup', { n: tally.dup }), tally.bad && t('bad', { n: tally.bad }), tally.big && t('big', { n: tally.big })]
      .filter(Boolean)
      .join(t('sep'));
    box.querySelector('b').textContent = t('import-done');
    box.querySelector('.r span').textContent = '';
    box.querySelector('.prog i').style.width = '100%';
    box.querySelector('small').textContent =
      t('imported', { n: tally.done }) + (skipped ? t('skipped', { n: skipped, why }) : '') + (tally.fail ? t('failed-n', { n: tally.fail }) : '');
    Object.assign(tally, { total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 });
    box.timer = setTimeout(() => (box.hidden = true), 4000);
  }

  async function removeSelected() {
    if (!allowWrite()) return;
    const text = t('delete-photos-text', { n: selected.size });
    if (!(await dialog({ title: t('delete-photos'), text, ok: t('delete'), danger: true }))) return;
    try {
      album = await api.deletePhotos(id, [...selected]);
      selecting = false;
      selected.clear();
      render();
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    }
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

  function onTile(t) {
    if (suppressClick) return;
    if (!selecting) return open(`#/a/${id}/p/${t.dataset.id}`);
    const pid = t.dataset.id;
    if (selected.has(pid)) selected.delete(pid);
    else selected.add(pid);
    t.classList.toggle('sel', selected.has(pid));
    renderPicking();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (['upload', 'rename', 'delete'].includes(act) && !allowWrite()) return;
    const t = e.target.closest('.tile');
    if (t && !act) return onTile(t);
    if (!album) return;
    if (act === 'upload') input.click();
    else if (act === 'select' || act === 'cancel') {
      selecting = act === 'select';
      selected.clear();
      render();
    } else if (act === 'delete') removeSelected();
    else if (act === 'rename') rename();
    else if (act === '3d') open(`#/a/${id}/3d`);
  }

  // Desktop reordering with the pointer (spec §9): a ghost follows, the others make room.
  function onPointerDown(e) {
    const t = e.target.closest('.tile');
    if (!t || selecting || !fine.matches || e.button !== 0 || !canWrite()) return;
    drag = { t, x0: e.clientX, y0: e.clientY, mx: -Infinity, my: -Infinity, ghost: null, before: '' };
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
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
  function onDrop(e) {
    if (!hasFiles(e) || !album) return;
    e.preventDefault();
    main.classList.remove('dropping');
    enqueue(e.dataTransfer.files);
  }

  const onFocus = () => {
    if (!uploading && !drag && !viewer) load();
  };
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
  load();

  return {
    canLeave(next, again) {
      if (!again && next.album === id && next.photo === route.photo) return true;
      return lightbox?.canLeave() ?? true;
    },
    update(next) {
      route = next;
      if (album) sync();
    },
    destroy() {
      alive = false;
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
    },
  };
}
