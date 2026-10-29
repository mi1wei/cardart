import { api } from './api.js';
import { lang, t } from './i18n.js';
import { icon } from './ui.js';

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

export function createPhotoDetails(root) {
  const trigger = root.querySelector('[data-act=details]');
  const panel = document.createElement('aside');
  panel.className = 'lb-details';
  panel.id = 'photo-details';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'photo-details-title');
  panel.innerHTML = `
    <header class="lb-details-header"><h2 id="photo-details-title"></h2>
      <button class="ibtn" type="button" data-act="details-close">${icon('close')}</button>
    </header>
    <p class="lb-details-status" role="status"></p>
    <div class="lb-details-content"></div>`;
  panel.querySelector('h2').textContent = t('details');
  panel.querySelector('button').setAttribute('aria-label', t('details-close'));
  root.append(panel);
  const status = panel.querySelector('.lb-details-status');
  const content = panel.querySelector('.lb-details-content');
  let current;
  let opened = false;
  let revision = 0;
  let controller;

  function group(label, rows) {
    const section = document.createElement('section');
    section.className = 'lb-details-group';
    const heading = document.createElement('h3');
    heading.textContent = t(label);
    const list = document.createElement('dl');
    for (const [key, title, value] of rows) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.dataset.field = `${key}-label`;
      description.dataset.field = key;
      term.textContent = t(title);
      description.textContent = value ?? t('details-not-provided');
      row.append(term, description);
      list.append(row);
    }
    section.append(heading, list);
    content.append(section);
  }

  function render(metadata, { loading = false, failed = false } = {}) {
    const photo = current.photo;
    panel.setAttribute('aria-busy', String(loading));
    status.textContent = loading ? t('details-loading') : failed ? t('details-unavailable') :
      metadata?.exifStatus === 'none' ? t('details-no-exif') : metadata?.exifStatus === 'unreadable' ? t('details-unreadable') : '';
    status.hidden = !status.textContent;
    content.replaceChildren();
    const file = [
      ['file-name', 'details-file-name', photo.name],
      ['format', 'details-format', metadata?.format ? (metadata.format === 'heif' ? 'HEIC' : metadata.format.toUpperCase()) : null],
      ['dimensions', 'details-dimensions', `${number(photo.w, 0)} × ${number(photo.h, 0)}`],
      ['bytes', 'details-size', bytes(metadata?.bytes)],
    ];
    if (metadata?.fileModifiedAt && Number.isFinite(Date.parse(metadata.fileModifiedAt))) file.push([
      'file-modified', metadata.fileTimeSource === 'source-file' ? 'details-file-modified' : 'details-copy-modified',
      new Intl.DateTimeFormat(locale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(metadata.fileModifiedAt)),
    ]);
    if (metadata?.orientation) file.push(['orientation', 'details-orientation', `EXIF ${metadata.orientation}`]);
    group('details-file', file);
    if (loading) return;
    group('details-capture', [['taken-at', metadata?.takenAt?.source === 'CreateDate' ? 'details-exif-created' : 'details-taken-at', capture(metadata?.takenAt)]]);
    const camera = [];
    if (metadata?.cameraMake || metadata?.cameraModel) camera.push(['camera', 'details-camera-model', [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(' ')]);
    if (metadata?.lensModel) camera.push(['lens', 'details-lens', metadata.lensModel]);
    if (metadata?.fNumber) camera.push(['aperture', 'details-aperture', `f/${number(metadata.fNumber)}`]);
    if (metadata?.exposureTime) camera.push(['exposure', 'details-exposure', exposure(metadata.exposureTime)]);
    if (metadata?.iso) camera.push(['iso', 'details-iso', number(metadata.iso, 0)]);
    if (metadata?.focalLength) camera.push(['focal-length', 'details-focal-length', `${number(metadata.focalLength)} mm`]);
    if (camera.length) group('details-camera', camera);
    const location = Number.isFinite(metadata?.latitude) && Number.isFinite(metadata?.longitude) ?
      `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}` : t('details-no-location');
    group('details-location', [['location', 'details-coordinates', location]]);
  }

  async function load() {
    controller?.abort();
    controller = new AbortController();
    const request = ++revision;
    render(null, { loading: true });
    try {
      const result = await api.photoDetails(current.albumId, current.photo.id, { signal: controller.signal });
      if (request === revision && opened && root.isConnected && result.photoId === current.photo.id) render(result.metadata);
    } catch (error) {
      if (error.name !== 'AbortError' && request === revision && opened && root.isConnected) render(null, { failed: true });
    }
  }

  function close() {
    if (!opened) return false;
    opened = false;
    revision++;
    controller?.abort();
    panel.hidden = true;
    root.classList.remove('has-details');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
    return true;
  }

  return {
    setPhoto(albumId, photo) {
      const key = `${albumId}/${photo.id}/${photo.sha256}`;
      if (current?.key === key) return;
      current = { key, albumId, photo };
      panel.scrollTop = 0;
      if (opened) void load();
    },
    toggle() {
      if (close()) return;
      opened = true;
      panel.hidden = false;
      root.classList.add('has-details');
      trigger.setAttribute('aria-expanded', 'true');
      panel.scrollTop = 0;
      void load();
      panel.querySelector('button').focus();
    },
    close,
    contains: (element) => opened && panel.contains(element),
    dispose() { revision++; controller?.abort(); panel.remove(); },
  };
}
