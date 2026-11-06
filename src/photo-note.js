import { api } from './api.js';
import { t } from './i18n.js';
import { allowWrite, canWrite } from './license.js';
import { toast } from './ui.js';

export function createPhotoNote(host, onAlbum) {
  const root = document.createElement('section');
  root.className = 'photo-note';
  root.setAttribute('aria-label', t('note-title'));
  root.innerHTML = `
    <div class="note-heading"><span class="note-label">${t('note-title')}</span><span class="note-readonly">${t('note-readonly')}</span><button type="button" class="note-edit" data-note-edit></button></div>
    <p class="note-text" id="photo-note-text"></p>
    <button class="note-expand" type="button" data-note-expand aria-controls="photo-note-text" aria-expanded="false" hidden></button>
    <form class="note-form" hidden>
      <label class="note-field-label" for="photo-note-input">${t('note-text')}</label>
      <textarea class="note-input" id="photo-note-input" rows="4" spellcheck="false"></textarea>
      <div class="note-form-meta"><span class="note-help">${t('note-help')}</span><span class="note-count"></span></div>
      <p class="note-error" role="status" hidden></p>
      <div class="note-form-actions"><button type="button" class="note-clear" data-note-clear>${t('note-clear')}</button><button type="button" class="btn" data-note-cancel>${t('cancel')}</button><button type="submit" class="btn pri" data-write data-note-save>${t('note-save')}</button></div>
    </form>`;
  host.append(root);
  const $ = (selector) => root.querySelector(selector);
  const edit = $('[data-note-edit]');
  const text = $('.note-text');
  const expand = $('[data-note-expand]');
  const form = $('.note-form');
  const input = $('.note-input');
  const save = $('[data-note-save]');
  const cancel = $('[data-note-cancel]');
  const clear = $('[data-note-clear]');
  const error = $('.note-error');
  input.placeholder = t('note-placeholder');
  input.maxLength = 4000;
  let current;
  let editing = false;
  let saving = false;
  let pendingPhotoChange = false;
  let expanded = false;
  let alive = true;
  let previousNote = '';
  let message = '';
  const saved = () => typeof current?.photo.note === 'string' ? current.photo.note : '';

  function syncExpansion() {
    expand.hidden = editing || !saved() || (!expanded && text.scrollHeight <= text.clientHeight + 1);
    expand.textContent = t(expanded ? 'note-collapse' : 'note-expand');
    expand.setAttribute('aria-expanded', String(expanded));
  }

  function syncInput() {
    const length = [...input.value.replace(/\r\n?/g, '\n').trim()].length;
    $('.note-count').textContent = `${length} / 2000`;
    input.readOnly = saving || pendingPhotoChange || !canWrite();
    save.disabled = saving || pendingPhotoChange || !canWrite() || length > 2000 || input.value === previousNote;
    cancel.disabled = saving || pendingPhotoChange;
    clear.disabled = saving || pendingPhotoChange || !canWrite() || !input.value;
    error.textContent = saving ? t('note-saving') : pendingPhotoChange ? t(current?.photo.kind === 'video' ? 'note-video-wait-save' : 'note-wait-save') : length > 2000 ? t('note-length') : message;
    error.hidden = !error.textContent;
    form.setAttribute('aria-busy', String(saving || pendingPhotoChange));
  }

  function render() {
    if (!current) return;
    const value = saved();
    input.placeholder = t(current.photo.kind === 'video' ? 'note-video-placeholder' : 'note-placeholder');
    $('.note-help').textContent = t(current.photo.kind === 'video' ? 'note-video-help' : 'note-help');
    root.hidden = !value && !canWrite() && !editing;
    root.dataset.empty = String(!value && !editing);
    $('.note-label').hidden = !value && !editing;
    $('.note-readonly').hidden = canWrite();
    edit.hidden = !canWrite() || editing;
    edit.disabled = pendingPhotoChange;
    edit.textContent = t(value ? 'note-edit' : 'note-add');
    text.textContent = value;
    text.hidden = editing || !value;
    text.classList.toggle('expanded', expanded);
    form.hidden = !editing;
    syncInput();
    requestAnimationFrame(syncExpansion);
  }

  function finishEditing() {
    editing = false;
    message = '';
    render();
    edit.focus({ preventScroll: true });
  }

  edit.addEventListener('click', () => {
    if (pendingPhotoChange || !allowWrite()) return;
    previousNote = saved();
    input.value = previousNote;
    editing = true;
    message = '';
    render();
    input.focus({ preventScroll: true });
  });
  input.addEventListener('input', syncInput);
  cancel.addEventListener('click', finishEditing);
  clear.addEventListener('click', () => { input.value = ''; syncInput(); input.focus({ preventScroll: true }); });
  expand.addEventListener('click', () => { expanded = !expanded; text.classList.toggle('expanded', expanded); syncExpansion(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || pendingPhotoChange || !editing || !allowWrite() || [...input.value.trim()].length > 2000) return;
    const snapshot = current;
    const value = input.value;
    saving = true;
    message = '';
    syncInput();
    try {
      const album = await api.updatePhotoNote(snapshot.albumId, snapshot.photo.id, value, previousNote);
      if (!alive || current.key !== snapshot.key) return;
      current = { ...current, photo: album.photos.find((photo) => photo.id === snapshot.photo.id) ?? current.photo };
      editing = false;
      expanded = false;
      onAlbum(album);
      toast(t('note-saved'));
    } catch (failure) {
      if (!alive || current.key !== snapshot.key) return;
      message = failure.status === 409 ? t('note-conflict') : t('save-failed', { reason: failure.message });
      if (failure.status === 409) {
        try {
          const album = await api.album(snapshot.albumId);
          if (alive && current.key === snapshot.key) onAlbum(album);
        } catch {}
      }
    } finally {
      if (alive && current.key === snapshot.key) { saving = false; render(); }
    }
  });
  window.addEventListener('folio-license-state', render);
  window.addEventListener('resize', syncExpansion);

  return {
    get saving() { return saving || pendingPhotoChange; },
    get dirty() { return saving || pendingPhotoChange || (editing && input.value !== previousNote); },
    setPending(value) { pendingPhotoChange = value; if (alive) render(); },
    setPhoto(albumId, photo) {
      const key = `${albumId}/${photo.id}/${photo.sha256}`;
      if (current?.key !== key) { editing = false; saving = false; expanded = false; message = ''; }
      current = { key, albumId, photo };
      render();
    },
    canLeave() {
      if (saving || pendingPhotoChange) { toast(t(current?.photo.kind === 'video' ? 'note-video-wait-save' : 'note-wait-save')); return false; }
      if (editing && input.value !== previousNote && !window.confirm(t(current?.photo.kind === 'video' ? 'note-video-discard' : 'note-discard'))) return false;
      if (editing) finishEditing();
      return true;
    },
    escape() {
      if (!editing) return false;
      if (saving || pendingPhotoChange) toast(t(current?.photo.kind === 'video' ? 'note-video-wait-save' : 'note-wait-save'));
      else finishEditing();
      return true;
    },
    dispose() {
      alive = false;
      window.removeEventListener('folio-license-state', render);
      window.removeEventListener('resize', syncExpansion);
      root.remove();
    },
  };
}
