import { api, mediaUrl } from './api.js';
import { dialog, icon, toast } from './ui.js';
import { t } from './i18n.js';
import { allowWrite } from './license.js';
import { createPhotoDetails } from './photo-details.js';
import { createPhotoZoom } from './lightbox-zoom.js';
import { createFilmstrip } from './lightbox-filmstrip.js';
import { lt } from './lightbox-text.js';
import { showUndo } from './undo.js';
import { c } from './collection-text.js';
import { chooseAlbum } from './collection-actions.js';
import './photo-view.css';

const KEYS = { ArrowLeft: 'prev', ArrowRight: 'next', Escape: 'close', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', '−': 'zoom-out', '0': 'fit', i: 'details', I: 'details', ' ': 'play' };

// Trash callers own restoration/purging and provide URLs; this mode never uses album write APIs.
export function openLightbox({ album, index = 0, onIndex = () => {}, onAlbum = () => {}, onClose = () => {}, media, trashActions }) {
  const mediaFor = (photo, size) => media ? media(photo, size) : mediaUrl(album.id, photo.id, size);
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  const root = document.createElement('div');
  root.className = 'lb';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.dataset.preview = String(Boolean(trashActions));
  root.innerHTML = `
    <header class="lb-bar">
      <button class="lb-back" type="button" data-act="close" aria-label="${t('close')}">${icon('prev')}<span class="lb-album-name"></span></button>
      <b class="lb-count" aria-live="polite"></b><span class="sp"></span>
      ${trashActions ? `
        <button class="lb-btn" type="button" data-write data-act="restore" aria-label="${lt('restore')}">${icon('refresh')}<span>${lt('restore')}</span></button>
        <button class="lb-btn" type="button" data-write data-act="purge" aria-label="${lt('purge')}">${icon('trash')}<span>${lt('purge')}</span></button>` : `
        <button class="ibtn lb-desktop-details" type="button" data-act="details" aria-label="${t('details')}" aria-expanded="false" aria-controls="photo-details">${icon('info')}</button>
        <button class="ibtn" type="button" data-act="original" aria-label="${t('original')}">${icon('download')}<span class="lb-sr">${t('original')}</span></button>
        <button class="ibtn lb-desktop-action" type="button" data-write data-act="delete" aria-label="${t('delete-photo')}">${icon('trash')}</button>
        <button class="ibtn lb-overflow" type="button" data-act="menu" aria-label="${t('more')}" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button>`}
    </header>
    <div class="lb-workspace"><section class="lb-preview">
      <div class="lb-stage"><img class="lb-img" alt="" draggable="false"><span class="lb-missing">${t('image-missing')}</span>
        <div class="lb-media-status" role="status" hidden><p></p><button class="btn" type="button" data-act="video-retry" hidden>${t('video-retry')}</button></div>
      </div>
      <button class="ibtn lb-nav l" type="button" data-act="prev" aria-label="${t('prev-photo')}">${icon('prev')}</button>
      <button class="ibtn lb-nav r" type="button" data-act="next" aria-label="${t('next-photo')}">${icon('next')}</button>
    </section></div>
    ${trashActions ? '' : `<div class="lb-menu" role="menu" hidden>
      <button type="button" role="menuitem" data-write data-act="menu-cover">${icon('image')}<span>${t('set-album-cover')}</span></button>
      <button type="button" role="menuitem" data-write data-act="menu-copy">${icon('copy')}<span>${t('copy-to-album')}</span></button>
      <button type="button" role="menuitem" data-write data-act="menu-move">${icon('move')}<span>${t('move-to-album')}</span></button>
      <button type="button" role="menuitem" data-write data-act="menu-delete">${icon('trash')}<span>${t('delete')}</span></button>
    </div>`}`;
  const $ = (s) => root.querySelector(s);
  const img = $('.lb-img');
  const mediaStatus = $('.lb-media-status');
  let video;
  let mediaKey;
  let mediaRevision = 0;
  let busy = false;
  let disposed = false;
  let originalAttempt = false;
  let detachVideoListeners = () => {};
  const details = trashActions ? null : createPhotoDetails(root, (next) => {
    const photoId = album.photos[index]?.id;
    onAlbum(next);
    if (root.isConnected) show(Math.max(0, next.photos.findIndex((photo) => photo.id === photoId)), next);
  });
  const filmstrip = createFilmstrip(root, mediaFor, go);
  const zoom = createPhotoZoom(root, {
    media: mediaFor,
    onSwipe(dx, dy) {
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.2) go(index + (dx < 0 ? 1 : -1));
      else if (matchMedia('(max-width: 860px)').matches && Math.abs(dy) >= 70 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        if (dy > 0) act('close');
        else details?.open();
      }
    },
    onZoom(photo) {
      // HEIC/TIFF originals may not decode in the browser; retain the generated preview.
      if (originalAttempt || !/\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(photo.file)) return;
      originalAttempt = true;
      img.src = mediaFor(photo, 'original');
    },
  });
  img.onload = () => root.classList.remove('missing');
  img.onerror = () => {
    if (originalAttempt && img.getAttribute('src') === mediaFor(album.photos[index], 'original')) {
      img.src = mediaFor(album.photos[index], 1600);
      return;
    }
    if (root.dataset.kind === 'video') img.hidden = true;
    else root.classList.add('missing');
  };

  function releaseVideo() {
    mediaRevision++;
    detachVideoListeners();
    detachVideoListeners = () => {};
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    video = null;
  }

  function setMedia(p, { force = false, autoplay = true, position = 0 } = {}) {
    const key = `${album.id}/${p.id}/${p.sha256}`;
    if (!force && mediaKey === key) return;
    releaseVideo();
    mediaKey = key;
    originalAttempt = false;
    root.dataset.kind = p.kind === 'video' ? 'video' : 'photo';
    root.classList.remove('missing');
    mediaStatus.hidden = true;
    $('[data-act=video-retry]').hidden = true;
    zoom.setPhoto(p);
    img.src = mediaFor(p, 1600);
    img.alt = p.name;
    img.hidden = p.kind === 'video';
    if (p.kind !== 'video') return;
    const node = document.createElement('video');
    node.className = 'lb-video';
    node.controls = true;
    node.playsInline = true;
    node.preload = 'metadata';
    node.poster = mediaFor(p, 1600);
    node.setAttribute('aria-label', p.name);
    video = node;
    const revision = mediaRevision;
    const current = () => root.isConnected && mediaRevision === revision && video === node;
    const sourceController = new AbortController();
    let sourceCheck;
    let sourceTimer;
    const failVideo = async (code) => {
      if (!current()) return;
      node.pause();
      node.hidden = true;
      img.hidden = false;
      if (code === 4) {
        mediaStatus.querySelector('p').textContent = t('video-checking');
        mediaStatus.hidden = false;
        if (!sourceCheck) {
          sourceTimer = setTimeout(() => sourceController.abort(), 5000);
          sourceCheck = fetch(mediaFor(p, 'original'), { method: 'HEAD', signal: sourceController.signal })
            .then((response) => response.ok, () => false).finally(() => clearTimeout(sourceTimer));
        }
        const available = await sourceCheck;
        if (!current()) return;
        code = available ? node.error?.code ?? code : 2;
      }
      mediaStatus.querySelector('p').textContent = t(code === 4 ? 'video-unsupported' : code === 3 ? 'video-decode-failed' : 'video-read-failed');
      mediaStatus.hidden = false;
      $('[data-act=video-retry]').hidden = code !== 2;
    };
    const onError = () => failVideo(node.error?.code ?? 2);
    const onMetadata = () => {
      if (current() && position > 0) node.currentTime = Math.min(position, Number.isFinite(node.duration) ? node.duration : position);
    };
    node.addEventListener('error', onError);
    node.addEventListener('loadedmetadata', onMetadata);
    detachVideoListeners = () => {
      node.removeEventListener('error', onError);
      node.removeEventListener('loadedmetadata', onMetadata);
      clearTimeout(sourceTimer);
      sourceController.abort();
    };
    $('.lb-stage').append(node);
    node.src = mediaFor(p, 'original');
    if (autoplay) {
      try {
        node.play().catch((error) => {
          if (current() && !['NotAllowedError', 'AbortError'].includes(error.name)) failVideo(node.error?.code ?? (error.name === 'NotSupportedError' ? 4 : 2));
        });
      } catch (error) { if (error.name !== 'NotAllowedError') failVideo(2); }
    }
  }

  function show(i, next = album) {
    if (disposed) return;
    album = next;
    if (!album.photos.length) { onClose(); return; }
    index = Math.max(0, Math.min(album.photos.length - 1, i));
    const p = album.photos[index];
    setMedia(p);
    $('.lb-count').textContent = `${index + 1} / ${album.photos.length}`;
    $('.lb-album-name').textContent = album.title;
    $('.lb-back').setAttribute('aria-label', t(trashActions ? 'back-to-trash' : 'back-to-album', { title: album.title }));
    root.setAttribute('aria-label', `${trashActions ? lt('trash-preview') : album.title} · ${index + 1} / ${album.photos.length}`);
    details?.setPhoto(album.id, p);
    filmstrip.set(album.photos, index);
    $('[data-act=prev]').disabled = index === 0;
    $('[data-act=next]').disabled = index === album.photos.length - 1;
    $('[data-act=prev]').setAttribute('aria-label', t(p.kind === 'video' ? 'prev-item' : 'prev-photo'));
    $('[data-act=next]').setAttribute('aria-label', t(p.kind === 'video' ? 'next-item' : 'next-photo'));
    if (!trashActions) {
      const isCover = (album.cover ?? album.photos[0].id) === p.id;
      for (const button of root.querySelectorAll('[data-act=sheet-cover], [data-act=menu-cover]')) button.disabled = isCover;
      for (const label of root.querySelectorAll('[data-act=sheet-cover] span, [data-act=menu-cover] span')) label.textContent = t(isCover ? 'already-cover' : 'set-album-cover');
      $('[data-act=original]').setAttribute('aria-label', t(p.kind === 'video' ? 'original-video' : 'original'));
      $('[data-act=original] span').textContent = t(p.kind === 'video' ? 'original-video' : 'original');
      $('[data-act=delete]').setAttribute('aria-label', t(p.kind === 'video' ? 'delete-video' : 'delete-photo'));
    }
    for (const j of [index - 1, index + 1]) {
      if (album.photos[j]) new Image().src = mediaFor(album.photos[j], 1600);
    }
  }

  function go(i) {
    if (i < 0 || i >= album.photos.length || i === index) return;
    if (busy || (details && !details.canLeave())) return;
    closeMenu();
    show(i);
    onIndex(album.photos[index].id);
  }

  function closeMenu() {
    const menu = $('.lb-menu');
    if (!menu || menu.hidden) return false;
    menu.hidden = true;
    $('[data-act=menu]').setAttribute('aria-expanded', 'false');
    $('[data-act=menu]').focus({ preventScroll: true });
    return true;
  }
  function setPending(value) {
    busy = value;
    root.dataset.busy = String(value);
    details?.setPending(value);
  }
  async function act(name) {
    name = name.replace(/^(sheet|menu)-/, '');
    if (disposed || !album.photos[index]) return;
    if (trashActions && !['prev', 'next', 'close', 'restore', 'purge', 'video-retry', 'play', 'fit', 'actual', 'zoom-in', 'zoom-out'].includes(name)) return;
    const writes = ['cover', 'copy', 'move', 'delete', 'restore', 'purge'];
    if (writes.includes(name) && !allowWrite()) return;
    const p = album.photos[index];
    if (busy || (writes.includes(name) && details?.saving)) { toast(t(p.kind === 'video' ? 'note-video-wait-save' : 'note-wait-save')); return; }
    try {
      if (name === 'prev') go(index - 1);
      else if (name === 'next') go(index + 1);
      else if (name === 'close' && (!details || details.canLeave())) onClose();
      else if (name === 'details') { closeMenu(); details?.toggle(); }
      else if (name === 'details-close') details?.close();
      else if (name === 'original') {
        const link = document.createElement('a');
        const url = new URL(mediaFor(p, 'original'), location.href);
        url.searchParams.set('download', '1');
        link.href = url.href;
        link.download = p.name;
        document.body.append(link);
        link.click();
        link.remove();
      }
      else if (['fit', 'actual', 'zoom-in', 'zoom-out'].includes(name)) zoom.act(name);
      else if (name === 'play' && video && !video.hidden) {
        if (video.paused) await video.play();
        else video.pause();
      } else if (name === 'menu') {
        const menu = $('.lb-menu');
        if (menu.hidden) {
          menu.hidden = false;
          $('[data-act=menu]').setAttribute('aria-expanded', 'true');
          menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
        } else closeMenu();
      }
      else if (name === 'video-retry') setMedia(p, { force: true });
      else if (name === 'restore' || name === 'purge') {
        setPending(true);
        const playback = { autoplay: Boolean(video && !video.paused), position: video?.currentTime || 0 };
        let released = false;
        try {
          if (name === 'purge' && !await dialog({ title: lt('purge-title'), text: lt('purge-text'), ok: lt('purge'), danger: true })) return;
          if (!root.isConnected || !allowWrite()) return;
          releaseVideo();
          released = true;
          const result = await trashActions[name]();
          if (root.isConnected && result !== false) onClose();
          else if (root.isConnected && p.kind === 'video') setMedia(p, { force: true, ...playback });
        } catch (error) {
          if (root.isConnected && released && p.kind === 'video') setMedia(p, { force: true, ...playback });
          throw error;
        } finally { setPending(false); }
      }
      else if (name === 'cover') {
        closeMenu();
        setPending(true);
        try {
          const next = await api.updateAlbum(album.id, { cover: p.id });
          if (!root.isConnected) return;
          show(index, next);
          onAlbum(album);
          toast(t('cover-set'));
        } finally { setPending(false); }
      } else if (name === 'copy' || name === 'move') {
        if (name === 'move' && !details.canLeave()) return;
        closeMenu();
        // Imports and batch changes hold html[data-busy]; a transfer waits for them (polish spec §8).
        if (document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
        const target = await chooseAlbum(album.id, name);
        if (!target || !root.isConnected || !allowWrite()) return;
        // The picker can turn a copy into a move, which takes the item and any unsaved note away.
        if (target.mode === 'move' && !details.canLeave()) return;
        if (document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
        setPending(true);
        document.documentElement.setAttribute('data-busy', '');
        let result;
        try { result = await api.transferPhotos(album.id, [p.id], target.id, target.mode); }
        finally {
          // Released before the album changes: a busy viewer would refuse the close below.
          document.documentElement.removeAttribute('data-busy');
          setPending(false);
        }
        onAlbum(result.album);
        toast(result.skipped
          ? c('transferred', { n: result.copied, skipped: result.skipped })
          : t(target.mode === 'move' ? 'moved-to' : 'copied-to', { album: target.title }));
        if (!root.isConnected) return;
        // A moved item leaves: show the next one, the previous one at the end, or close when none is left.
        if (!result.album.photos.length) return onClose();
        show(index, result.album);
        onIndex(album.photos[index].id);
      } else if (name === 'delete') {
        if (!details.canLeave()) return;
        closeMenu();
        const text = t(p.kind === 'video' ? 'delete-video-text' : 'delete-photo-text');
        setPending(true);
        // Back may have closed the lightbox while the confirmation was open.
        if (!(await dialog({ title: t(p.kind === 'video' ? 'delete-video' : 'delete-photo'), text, ok: t('delete'), danger: true })) || !root.isConnected || !allowWrite()) {
          setPending(false);
          return;
        }
        const wasPlaying = video && !video.paused;
        if (p.kind === 'video') { releaseVideo(); img.hidden = false; }
        try {
          const next = await api.deletePhotos(album.id, [p.id]);
          setPending(false);
          if (next.trashId) showUndo(next.trashId, async () => {
            if (!root.isConnected) return;
            const restored = await api.album(next.id);
            if (root.isConnected) { onAlbum(restored); show(index, restored); }
          });
          const undo = document.querySelector('.undo-toast');
          if (root.isConnected && undo) root.append(undo);
          onAlbum(next);
          if (!root.isConnected) return;
          if (!next.photos.length) return onClose();
          show(index, next);
          onIndex(album.photos[index].id);
        } catch (error) {
          if (root.isConnected && p.kind === 'video') {
            const fresh = await api.album(album.id).catch(() => null);
            if (root.isConnected && Array.isArray(fresh?.photos)) {
              const keep = fresh.photos.findIndex((item) => item.id === p.id);
              setPending(false);
              onAlbum(fresh);
              if (root.isConnected) {
                if (!fresh.photos.length) onClose();
                else {
                  if (keep >= 0) setMedia(fresh.photos[keep], { force: true, autoplay: wasPlaying });
                  show(keep >= 0 ? keep : Math.min(index, fresh.photos.length - 1), fresh);
                  onIndex(album.photos[index].id);
                }
              }
            } else if (root.isConnected) setMedia(p, { force: true, autoplay: wasPlaying });
          }
          throw error;
        } finally { setPending(false); }
      }
    } catch (err) {
      setPending(false);
      toast(t('failed', { reason: err.message }));
    }
  }

  // Capture phase: the lightbox gets the keys before the 3D viewer under it.
  function onKey(e) {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button:not(:disabled), textarea, input, video[controls], summary, [tabindex="0"]')]
        .filter((node) => !node.closest('[hidden], [inert]') && node.getClientRects().length);
      if (!buttons.length) { e.preventDefault(); root.focus(); return; }
      const first = buttons[0];
      const last = buttons.at(-1);
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      e.stopImmediatePropagation();
      return;
    }
    if (!KEYS[e.key] || e.metaKey || e.altKey || e.ctrlKey) return;
    if (video && (document.fullscreenElement === video || video.webkitDisplayingFullscreen)) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (document.fullscreenElement === video) document.exitFullscreen().catch(() => {});
        else video.webkitExitFullscreen?.();
      }
      return;
    }
    if (e.key !== 'Escape' && video && (e.composedPath().includes(video) || document.activeElement === video)) return;
    if (e.key !== 'Escape' && e.target.closest?.('textarea, input, [contenteditable=true]')) {
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === ' ' && e.target.closest?.('button, summary, select, a')) return;
    const selection = window.getSelection();
    if (e.key !== 'Escape' && selection && !selection.isCollapsed &&
      (details?.contains(selection.anchorNode) || details?.contains(selection.focusNode))) {
      e.stopImmediatePropagation();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    filmstrip.reveal();
    if (e.key === 'Escape') {
      if (zoom.zoomed) { zoom.reset(); return; }
      if (closeMenu() || details?.escape()) return;
    }
    act(KEYS[e.key]);
  }

  root.addEventListener('click', (e) => {
    const name = e.target.closest('[data-act]')?.dataset.act;
    if (name) act(name);
    else if (!e.target.closest('.lb-menu')) closeMenu();
  });
  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  document.body.style.overflow = 'hidden';
  show(index);
  root.focus({ preventScroll: true });

  return {
    show,
    editNote() {
      if (disposed || busy || !details || !allowWrite()) return;
      details.open();
      root.querySelector('[data-note-edit]')?.click();
    },
    canLeave: () => !busy && (!details || details.canLeave()),
    close() {
      if (disposed) return;
      disposed = true;
      releaseVideo();
      details?.dispose();
      filmstrip.dispose();
      zoom.dispose();
      window.removeEventListener('keydown', onKey, true);
      for (const undo of root.querySelectorAll('.undo-toast')) document.body.append(undo);
      root.remove();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
  };
}
