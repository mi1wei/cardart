import { api, mediaUrl } from './api.js';
import { openLightbox } from './lightbox.js';
import { close, open, swap } from './router.js';
import { dialog, icon, toast } from './ui.js';

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

  app.innerHTML = `
    <main class="mgr album-page">
      <header class="bar">
        <button class="btn ghost" type="button" data-act="back">${icon('prev')}<span>全部相册</span></button>
        <div class="ttl"><h1><button class="title" type="button" data-act="rename" title="点击改名"></button></h1><span class="count"></span></div>
        <span class="sp"></span>
        <div class="acts normal">
          <button class="btn" type="button" data-act="select">选择</button>
          <button class="btn" type="button" data-act="upload">${icon('upload')}<span>上传照片</span></button>
          <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>3D 翻阅</span></button>
        </div>
        <div class="acts picking" hidden>
          <button class="btn ghost" type="button" data-act="cancel">取消</button>
          <span class="picked"></span>
          <button class="btn danger" type="button" data-act="delete">${icon('trash')}<span>删除</span></button>
        </div>
      </header>
      <div class="grid" hidden></div>
      <div class="drop" hidden>
        ${icon('upload')}
        <b>把照片拖到这里</b>
        <span>或 <button class="link" type="button" data-act="upload">点这里选择照片</button></span>
        <small>支持 JPG、PNG、HEIC、WebP</small>
      </div>
      <div class="fab">
        <button class="btn" type="button" data-act="upload">${icon('upload')}<span>上传</span></button>
        <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>3D 翻阅</span></button>
      </div>
      <input type="file" accept="image/*,.heic,.heif" multiple hidden>
      <div class="upload" hidden><div class="r"><b></b><span></span></div><div class="prog"><i></i></div><small></small></div>
    </main>`;
  const $ = (s) => app.querySelector(s);
  const main = $('.mgr');
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
      if (err.status === 404) main.innerHTML = '<p class="empty">相册不存在。<a href="#/">回到全部相册</a></p>';
      else toast(`加载失败：${err.message}`);
    }
  }

  const base = () => `#/a/${id}${route.three ? '/3d' : ''}`;

  // The lightbox changed the album (cover, deletion): redraw what lies under it.
  function changed(next) {
    album = next;
    render();
  }

  // Opens, moves or closes the lightbox to match the address.
  function sync() {
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
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tile';
    t.dataset.id = p.id;
    t.classList.toggle('sel', selected.has(p.id));
    t.innerHTML = `<img alt="" loading="lazy" draggable="false" src="${mediaUrl(id, p.id, 600)}">${isCover ? '<span class="badge">封面</span>' : ''}<span class="chk">${icon('check')}</span>`;
    t.querySelector('img').onerror = () => t.classList.add('missing');
    return t;
  }

  function render() {
    const n = album.photos.length;
    $('.title').textContent = album.title;
    $('.count').textContent = `${n} 张`;
    document.title = `${album.title} · 相册`;
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
    $('.picked').textContent = `已选 ${selected.size} 张`;
    $('.acts.picking [data-act=delete]').disabled = selected.size === 0;
  }

  // Uploads go one at a time (spec §7); files added meanwhile join the same run.
  function enqueue(files) {
    const list = [...files];
    if (!list.length || !album) return;
    queue.push(...list);
    tally.total += list.length;
    if (!uploading) pump();
  }

  async function pump() {
    uploading = true;
    box.hidden = false;
    clearTimeout(box.timer);
    box.querySelector('small').textContent = '';
    while (queue.length && alive) {
      const file = queue.shift();
      const i = tally.total - queue.length;
      box.querySelector('b').textContent = `正在导入 ${i} / ${tally.total}`;
      box.querySelector('.r span').textContent = file.name;
      box.querySelector('.prog i').style.width = `${((i - 1) / tally.total) * 100}%`;
      try {
        const res = await api.upload(id, file);
        if (res.photo) {
          tally.done++;
          album = { ...album, photos: [...album.photos, res.photo] };
          if (album.photos.length === 1) render();
          else grid.append(tile(res.photo, false));
          $('.count').textContent = `${album.photos.length} 张`;
        } else tally[SKIP[res.skipped]]++;
      } catch {
        tally.fail++;
      }
    }
    uploading = false;
    if (!alive) return;
    const skipped = tally.dup + tally.bad + tally.big;
    const why = [tally.dup && `重复 ${tally.dup}`, tally.bad && `格式不支持 ${tally.bad}`, tally.big && `太大 ${tally.big}`]
      .filter(Boolean)
      .join('，');
    box.querySelector('b').textContent = '导入完成';
    box.querySelector('.r span').textContent = '';
    box.querySelector('.prog i').style.width = '100%';
    box.querySelector('small').textContent =
      `已导入 ${tally.done} 张` + (skipped ? `，跳过 ${skipped} 张（${why}）` : '') + (tally.fail ? `，失败 ${tally.fail} 张` : '');
    Object.assign(tally, { total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 });
    box.timer = setTimeout(() => (box.hidden = true), 4000);
  }

  async function removeSelected() {
    const text = `删除 ${selected.size} 张照片？删除后不能恢复。`;
    if (!(await dialog({ title: '删除照片', text, ok: '删除', danger: true }))) return;
    try {
      album = await api.deletePhotos(id, [...selected]);
      selecting = false;
      selected.clear();
      render();
    } catch (err) {
      toast(`操作失败：${err.message}`);
    }
  }

  async function rename() {
    const title = await dialog({ title: '重命名相册', value: album.title, ok: '保存' });
    if (!title || title === album.title) return;
    try {
      album = await api.updateAlbum(id, { title });
      $('.title').textContent = album.title;
      document.title = `${album.title} · 相册`;
    } catch (err) {
      toast(`操作失败：${err.message}`);
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
    const t = e.target.closest('.tile');
    if (t && !act) return onTile(t);
    if (!album && act !== 'back') return;
    if (act === 'back') close('#/');
    else if (act === 'upload') input.click();
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
    if (!t || selecting || !fine.matches || e.button !== 0) return;
    drag = { t, x0: e.clientX, y0: e.clientY, ghost: null, before: '' };
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
    if (over && over !== drag.t && over.parentElement === grid) {
      const kids = [...grid.children];
      if (kids.indexOf(over) > kids.indexOf(drag.t)) over.after(drag.t);
      else over.before(drag.t);
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
    try {
      album = await api.updateAlbum(id, { order });
      render(); // the cover badge follows the first photo
    } catch (err) {
      toast(err.status === 409 ? '照片有变化，已刷新' : `操作失败：${err.message}`);
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
    if (!uploading && !drag) load();
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
    update(next) {
      route = next;
      if (album) sync();
    },
    destroy() {
      alive = false;
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
