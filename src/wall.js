import { api, mediaUrl } from './api.js';
import { open } from './router.js';
import { dialog, icon, toast } from './ui.js';
import { openPhoneDialog } from './phone.js';

// Phone access is set up on the computer only (spec §12).
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function renderWall(app) {
  let alive = true;
  let albums = [];
  document.title = '相册';
  app.innerHTML = `
    <main class="mgr">
      <header class="bar">
        <h1 class="brand"><span class="logo">${icon('book')}</span>相册</h1>
        <span class="sp"></span>
        ${local ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>手机访问</span></button>` : ''}
        <button class="btn pri" type="button" data-act="new" aria-label="新建相册">${icon('plus')}<span>新建相册</span></button>
      </header>
      <div class="wall"></div>
      <p class="empty" hidden>还没有相册，点「新建相册」开始。</p>
    </main>`;
  const wall = app.querySelector('.wall');

  async function load() {
    try {
      const list = await api.albums();
      if (!alive) return;
      albums = list;
      wall.replaceChildren(...albums.map(card));
      app.querySelector('.empty').hidden = albums.length > 0;
    } catch (err) {
      if (alive) toast(`加载失败：${err.message}`);
    }
  }

  function card(a) {
    const el = document.createElement('article');
    el.className = 'album';
    el.dataset.id = a.id;
    el.innerHTML = `
      <a class="cover" href="#/a/${a.id}" data-act="open">${a.cover ? `<img alt="" src="${mediaUrl(a.id, a.cover.id, 600)}">` : icon('book')}</a>
      <div class="meta">
        <div class="names"><h2></h2><p>${a.count} 张</p></div>
        <button class="ibtn" type="button" data-act="menu" aria-label="更多">${icon('more')}</button>
      </div>`;
    el.querySelector('h2').textContent = a.title;
    return el;
  }

  const closeMenu = () => app.querySelector('.menu')?.remove();

  async function onClick(e) {
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    const a = albums.find((x) => x.id === e.target.closest('.album')?.dataset.id);
    if (act !== 'menu') closeMenu();
    try {
      if (act === 'open') {
        e.preventDefault();
        open(`#/a/${a.id}`);
      } else if (act === 'menu') {
        const shown = target.parentElement.querySelector('.menu');
        closeMenu();
        if (!shown) {
          target.insertAdjacentHTML(
            'afterend',
            '<div class="menu" role="menu"><button type="button" data-act="rename">重命名</button><button type="button" class="red" data-act="delete">删除相册</button></div>',
          );
        }
      } else if (act === 'phone') {
        openPhoneDialog();
      } else if (act === 'new') {
        const title = await dialog({ title: '新建相册', value: '新相册', ok: '创建' });
        if (title) open(`#/a/${(await api.createAlbum(title)).id}`);
      } else if (act === 'rename') {
        const title = await dialog({ title: '重命名相册', value: a.title, ok: '保存' });
        if (title && title !== a.title) await api.updateAlbum(a.id, { title });
        load();
      } else if (act === 'delete') {
        const text = `删除相册「${a.title}」？相册里的照片会一起删除，不能恢复。`;
        if (await dialog({ title: '删除相册', text, ok: '删除', danger: true })) await api.deleteAlbum(a.id);
        load();
      }
    } catch (err) {
      toast(`操作失败：${err.message}`);
    }
  }

  const onFocus = () => load();
  app.addEventListener('click', onClick);
  window.addEventListener('focus', onFocus);
  load();
  return {
    destroy() {
      alive = false;
      app.removeEventListener('click', onClick);
      window.removeEventListener('focus', onFocus);
    },
  };
}
