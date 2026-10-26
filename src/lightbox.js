import { api, mediaUrl } from './api.js';
import { dialog, icon, toast } from './ui.js';

const KEYS = { ArrowLeft: 'prev', ArrowRight: 'next', Escape: 'close' };

export function openLightbox({ album, index, onIndex, onAlbum, onClose }) {
  const root = document.createElement('div');
  root.className = 'lb';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <header class="lb-bar">
      <b class="lb-count"></b><span class="lb-name"></span><span class="sp"></span>
      <button class="lb-btn" type="button" data-act="cover">${icon('star')}<span>设为封面</span></button>
      <button class="lb-btn" type="button" data-act="original">${icon('expand')}<span>查看原图</span></button>
      <button class="lb-btn" type="button" data-act="delete">${icon('trash')}<span>删除</span></button>
      <button class="ibtn" type="button" data-act="close" aria-label="关闭">${icon('close')}</button>
    </header>
    <img class="lb-img" alt="">
    <button class="ibtn lb-nav l" type="button" data-act="prev" aria-label="上一张">${icon('prev')}</button>
    <button class="ibtn lb-nav r" type="button" data-act="next" aria-label="下一张">${icon('next')}</button>`;
  const $ = (s) => root.querySelector(s);
  const img = $('.lb-img');
  img.onload = () => root.classList.remove('missing');
  img.onerror = () => root.classList.add('missing');

  function show(i, next = album) {
    album = next;
    index = Math.max(0, Math.min(album.photos.length - 1, i));
    const p = album.photos[index];
    img.src = mediaUrl(album.id, p.id, 1600);
    $('.lb-count').textContent = `${index + 1} / ${album.photos.length}`;
    $('.lb-name').textContent = p.name;
    $('[data-act=prev]').disabled = index === 0;
    $('[data-act=next]').disabled = index === album.photos.length - 1;
    $('[data-act=cover]').disabled = (album.cover ?? album.photos[0].id) === p.id;
    for (const j of [index - 1, index + 1]) {
      if (album.photos[j]) new Image().src = mediaUrl(album.id, album.photos[j].id, 1600);
    }
  }

  function go(i) {
    if (i < 0 || i >= album.photos.length || i === index) return;
    show(i);
    onIndex(album.photos[index].id);
  }

  async function act(name) {
    const p = album.photos[index];
    try {
      if (name === 'prev') go(index - 1);
      else if (name === 'next') go(index + 1);
      else if (name === 'close') onClose();
      else if (name === 'original') window.open(mediaUrl(album.id, p.id, 'original'), '_blank');
      else if (name === 'cover') {
        show(index, await api.updateAlbum(album.id, { cover: p.id }));
        onAlbum(album);
        toast('已设为封面');
      } else if (name === 'delete') {
        const text = '删除这张照片？删除后不能恢复。';
        // Back may have closed the lightbox while the confirmation was open.
        if (!(await dialog({ title: '删除照片', text, ok: '删除', danger: true })) || !root.isConnected) return;
        const next = await api.deletePhotos(album.id, [p.id]);
        onAlbum(next);
        if (!root.isConnected) return; // closed while deleting: the address is no longer ours
        if (!next.photos.length) return onClose();
        show(index, next);
        onIndex(album.photos[index].id);
      }
    } catch (err) {
      toast(`操作失败：${err.message}`);
    }
  }

  // Capture phase: the lightbox gets the keys before the 3D viewer under it.
  function onKey(e) {
    if (!KEYS[e.key] || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    act(KEYS[e.key]);
  }

  // A horizontal swipe of 50 px or more pages, as on the phone's photo app.
  let x0 = null;
  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('button')) x0 = e.clientX;
  });
  root.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) >= 50) go(index + (dx < 0 ? 1 : -1));
  });
  root.addEventListener('click', (e) => {
    const name = e.target.closest('[data-act]')?.dataset.act;
    if (name) act(name);
  });
  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  show(index);

  return {
    show,
    close() {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
}
