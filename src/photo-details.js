import { api } from './api.js';
import { lang, t } from './i18n.js';
import { icon } from './ui.js';
import { createPhotoNote } from './photo-note.js';

const locale = () => lang() === 'zh' ? 'zh-CN' : 'en';
const number = (value, digits = 2) => new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, useGrouping: false }).format(value);
function bytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  const index = value ? Math.min(3, Math.floor(Math.log(value) / Math.log(1024))) : 0;
  return `${number(value / 1024 ** index, 1)} ${['B', 'KiB', 'MiB', 'GiB'][index]}`;
}
function capture(value) {
  if (!value) return null;
  return value.local.replace('T', ' ') + (value.subsecond ? `.${value.subsecond}` : '') +
    (value.offset ? ` ${value.offset}` : t('details-timezone-unknown'));
}
function exposure(value) {
  if (!value) return null;
  const denominator = Math.round(1 / value);
  return value < 1 && Math.abs(value * denominator - 1) < 0.02 ? `1/${denominator} s` : `${number(value, 4)} s`;
}

export function createPhotoDetails(root, onAlbum) {
  const panel = document.createElement('aside');
  panel.className = 'lb-details';
  panel.id = 'photo-details';
  panel.setAttribute('aria-labelledby', 'photo-details-title');
  panel.innerHTML = `
    <header class="lb-details-header"><span>${t('details')}</span><button class="ibtn" type="button" data-act="details-close" aria-label="${t('details-close')}">${icon('close')}</button></header>
    <div class="lb-title-row"><h2 class="lb-name" id="photo-details-title" data-field="file-name"></h2>
      <button class="lb-mobile-details" type="button" data-act="details" aria-label="${t('details')}" aria-expanded="true" aria-controls="photo-details-body">${t('details')}${icon('next')}</button>
      <button class="ibtn lb-delete" type="button" data-write data-act="delete" aria-label="${t('delete-photo')}">${icon('trash')}</button>
    </div>
    <div class="lb-facts"><span data-field="format"></span><span data-field="dimensions"></span><span data-field="bytes"></span></div>
    <div class="lb-note-host"></div>
    <div class="lb-details-body" id="photo-details-body"><p class="lb-details-status" role="status"></p><div class="lb-details-content"></div></div>
    <div class="lb-photo-actions"><button class="btn pri" type="button" data-act="original">${icon('expand')}<span>${t('original')}</span></button><button class="btn" type="button" data-write data-act="cover">${icon('star')}<span>${t('set-cover')}</span></button></div>`;
  root.querySelector('.lb-workspace').append(panel);
  const $ = (selector) => panel.querySelector(selector);
  const note = createPhotoNote($('.lb-note-host'), onAlbum);
  const status = $('.lb-details-status');
  const content = $('.lb-details-content');
  const body = $('.lb-details-body');
  const mobile = matchMedia('(max-width: 860px)');
  let current;
  let opened = true;
  let revision = 0;
  let controller;

  function fields(rows) {
    const list = document.createElement('dl');
    for (const [key, title, value] of rows) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.dataset.field = `${key}-label`;
      description.dataset.field = key;
      term.textContent = t(title);
      description.textContent = value;
      if (key === 'taken-at') {
        const date = document.createElement('span');
        const time = document.createElement('span');
        date.className = 'lb-capture-date';
        time.className = 'lb-capture-time';
        date.textContent = value.slice(0, 10);
        time.textContent = value.slice(11);
        description.replaceChildren(date, document.createTextNode(' '), time);
      }
      row.append(term, description);
      list.append(row);
    }
    return list;
  }
  function group(label, rows) {
    const section = document.createElement('section');
    section.className = 'lb-details-group';
    const heading = document.createElement('h3');
    heading.textContent = t(label);
    section.append(heading, fields(rows));
    content.append(section);
  }
  function disclosure(className, label, rows, open = false) {
    const section = document.createElement('details');
    section.className = className;
    section.open = open;
    const summary = document.createElement('summary');
    summary.textContent = t(label);
    const chevron = document.createElement('span');
    chevron.innerHTML = icon('next');
    summary.append(chevron);
    section.append(summary, fields(rows));
    content.append(section);
  }
  function render(metadata, { loading = false, failed = false } = {}) {
    const photo = current.photo;
    $('[data-field=file-name]').textContent = photo.name;
    $('[data-field=file-name]').title = photo.name;
    const format = metadata?.format || photo.file.split('.').at(-1);
    $('[data-field=format]').textContent = format === 'heif' ? 'HEIC' : format.toUpperCase();
    $('[data-field=dimensions]').textContent = `${number(photo.w, 0)} × ${number(photo.h, 0)}`;
    const size = bytes(metadata?.bytes);
    $('[data-field=bytes]').textContent = size || '';
    $('[data-field=bytes]').hidden = !size;
    body.setAttribute('aria-busy', String(loading));
    status.textContent = loading ? t('details-loading') : failed ? t('details-unavailable') :
      metadata?.exifStatus === 'none' ? t('details-no-exif') : metadata?.exifStatus === 'unreadable' ? t('details-unreadable') : '';
    status.hidden = !status.textContent;
    content.replaceChildren();
    if (!metadata) return;
    if (metadata.takenAt) group('details-capture', [['taken-at', metadata.takenAt.source === 'CreateDate' ? 'details-exif-created' : 'details-taken-at', capture(metadata.takenAt)]]);
    const camera = [];
    if (metadata.cameraMake || metadata.cameraModel) camera.push(['camera', 'details-camera-model', [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(' ')]);
    if (metadata.lensModel) camera.push(['lens', 'details-lens', metadata.lensModel]);
    if (camera.length) group('details-camera', camera);
    const settings = [];
    if (metadata.fNumber) settings.push(['aperture', 'details-aperture', `f/${number(metadata.fNumber)}`]);
    if (metadata.exposureTime) settings.push(['exposure', 'details-exposure', exposure(metadata.exposureTime)]);
    if (metadata.iso) settings.push(['iso', 'details-iso', number(metadata.iso, 0)]);
    if (metadata.focalLength) settings.push(['focal-length', 'details-focal-length', `${number(metadata.focalLength)} mm`]);
    if (settings.length) disclosure('lb-parameters', 'details-parameters', settings, !mobile.matches);
    if (Number.isFinite(metadata.latitude) && Number.isFinite(metadata.longitude)) {
      disclosure('lb-gps', 'details-location', [['location', 'details-coordinates', `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`]], !mobile.matches);
    }
    const file = [];
    if (metadata.fileModifiedAt && Number.isFinite(Date.parse(metadata.fileModifiedAt))) file.push([
      'file-modified', metadata.fileTimeSource === 'source-file' ? 'details-file-modified' : 'details-copy-modified',
      new Intl.DateTimeFormat(locale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(metadata.fileModifiedAt)),
    ]);
    if (metadata.orientation) file.push(['orientation', 'details-orientation', `EXIF ${metadata.orientation}`]);
    if (file.length) disclosure('lb-file-properties', 'details-more-file', file);
  }
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const request = ++revision;
    render(current.photo.metadata, { loading: true });
    try {
      const result = await api.photoDetails(current.albumId, current.photo.id, { signal: controller.signal });
      if (request === revision && opened && root.isConnected && result.photoId === current.photo.id) render(result.metadata);
    } catch (error) {
      if (error.name !== 'AbortError' && request === revision && opened && root.isConnected) render(current.photo.metadata, { failed: true });
    }
  }
  function sync() {
    panel.hidden = !opened && !mobile.matches;
    body.hidden = !opened;
    root.classList.toggle('has-details', opened);
    for (const trigger of root.querySelectorAll('[data-act=details]')) trigger.setAttribute('aria-expanded', String(opened));
  }
  function close() {
    if (!opened) return false;
    opened = false;
    revision++;
    controller?.abort();
    sync();
    root.querySelector(mobile.matches ? '.lb-mobile-details' : '.lb-desktop-details').focus({ preventScroll: true });
    return true;
  }
  function onLayoutChange() {
    sync();
    for (const section of content.querySelectorAll('.lb-parameters, .lb-gps')) section.open = !mobile.matches;
  }
  mobile.addEventListener('change', onLayoutChange);
  sync();
  return {
    get saving() { return note.saving; },
    setPhoto(albumId, photo) {
      const key = `${albumId}/${photo.id}/${photo.sha256}`;
      const changed = current?.key !== key;
      current = { key, albumId, photo };
      note.setPhoto(albumId, photo);
      if (changed) {
        root.scrollTop = 0;
        if (opened) void load();
        else render(photo.metadata);
      }
    },
    toggle() {
      if (close()) return;
      opened = true;
      sync();
      void load();
    },
    close,
    escape: () => note.escape() || close(),
    canLeave: () => note.canLeave(),
    contains: (element) => panel.contains(element),
    dispose() { revision++; controller?.abort(); mobile.removeEventListener('change', onLayoutChange); note.dispose(); panel.remove(); },
  };
}
