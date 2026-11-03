import { lang, t } from './i18n.js';
import { allowWrite } from './license.js';
import { onComputer } from './phone.js';
import { toast } from './ui.js';
import { pdfText } from './pdf-text.js';
import { buildPrintModel, normalizePdfOptions, renderPrintPage } from './print-layout.js';
import './print-layout.css';

let activeCleanup;

// Returns an idempotent cleanup function for the album view's navigation teardown.
export function openPdfExport(album) {
  if (!onComputer || document.documentElement.hasAttribute('data-busy') || !allowWrite()) return () => {};
  activeCleanup?.();
  const language = lang();
  const text = (key, value) => pdfText(key, value, language);
  const d = document.createElement('dialog');
  d.className = 'pdf-export';
  d.setAttribute('aria-label', text('title'));
  d.innerHTML = `<form class="pdf-export-form">
    <section class="pdf-preview" aria-label="${text('preview', '')}"></section>
    <section class="pdf-options">
      <h2>${text('title')}</h2>
      <fieldset>
        <label class="pdf-option">${text('paper')}<select name="paper"><option value="A4">${text('A4')}</option><option value="Letter">${text('Letter')}</option></select></label>
        <label class="pdf-option">${t('per-page')}<select name="perPage">${[1, 2, 3].map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select><small>${text('same')}</small></label>
        <label class="pdf-option">${text('quality')}<select name="quality"><option value="standard">${text('standard')}</option><option value="high">${text('high')}</option></select></label>
        <label class="pdf-check"><input name="cover" type="checkbox" checked>${text('cover')}</label>
        <label class="pdf-check"><input name="captions" type="checkbox" checked>${text('captions')}</label>
      </fieldset>
      <small>${text('videoHint')}</small>
      <div class="pdf-actions"><button type="button" class="btn" data-act="cancel">${text('cancel')}</button><button type="submit" class="btn pri" data-act="export">${text('export')}</button></div>
    </section>
  </form>`;
  const form = d.querySelector('form');
  const button = d.querySelector('[data-act=export]');
  const preview = d.querySelector('.pdf-preview');
  form.elements.perPage.value = String(normalizePdfOptions(album).perPage);
  let closed = false;
  let busy = false;
  let requestId;
  let browser;
  let popup;
  let timer;
  let timeout;
  let resize;
  function options() {
    return normalizePdfOptions(album, {
      paper: form.elements.paper.value, perPage: Number(form.elements.perPage.value),
      quality: form.elements.quality.value, cover: form.elements.cover.checked, captions: form.elements.captions.checked,
    });
  }
  function scalePreview() {
    preview.querySelectorAll('.pdf-preview-page').forEach((wrapper) => {
      const sheet = wrapper.firstElementChild;
      sheet.style.transform = `scale(${wrapper.clientWidth / sheet.offsetWidth})`;
    });
  }
  function updatePreview() {
    const model = buildPrintModel(album, options());
    const cover = document.createElement('div');
    cover.className = 'pdf-preview-cover';
    const spread = document.createElement('div');
    spread.className = 'pdf-preview-spread';
    const count = document.createElement('p');
    count.className = 'pdf-page-count';
    count.setAttribute('aria-live', 'polite');
    count.textContent = text('preview', model.pages.length);
    for (const page of model.pages.filter((page) => page.kind === 'cover').concat(model.pages.filter((page) => page.kind === 'photos').slice(0, 2))) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-preview-page';
      wrapper.style.aspectRatio = `${model.paper.width} / ${model.paper.height}`;
      const sheet = renderPrintPage(model, page, text('video'));
      sheet.querySelectorAll('img').forEach((image) => { image.src = image.src.replace(/\/(?:original|1600)$/, '/600'); });
      wrapper.append(sheet);
      (page.kind === 'cover' ? cover : spread).append(wrapper);
    }
    cover.hidden = !options().cover;
    preview.replaceChildren(cover, spread, count);
    button.disabled = !model.pages.length;
    requestAnimationFrame(scalePreview);
  }
  function setBusy(value) {
    busy = value;
    d.querySelector('fieldset').disabled = value;
    button.disabled = value;
    button.textContent = value ? text('preparing') : text('export');
    if (value) document.documentElement.setAttribute('data-busy', '');
    else document.documentElement.removeAttribute('data-busy');
  }
  function cleanup() {
    if (closed) return;
    closed = true;
    resize?.disconnect();
    clearInterval(timer);
    clearTimeout(timeout);
    browser?.postMessage({ type: 'cancel' });
    browser?.close();
    popup?.close();
    if (requestId && window.folioPDF) void window.folioPDF.cancel(requestId).catch(() => {});
    if (busy) setBusy(false);
    d.remove();
    window.removeEventListener('pagehide', cleanup);
    window.removeEventListener('hashchange', cleanup);
    if (activeCleanup === cleanup) activeCleanup = null;
  }
  function failed(error) {
    if (closed) return;
    clearInterval(timer);
    clearTimeout(timeout);
    browser?.close();
    popup?.close();
    browser = null;
    popup = null;
    setBusy(false);
    updatePreview();
    toast(text('failed', error.message));
  }
  function saved(result) {
    if (closed) return;
    requestId = null;
    cleanup();
    const notice = document.createElement('div');
    notice.className = 'toast pdf-saved';
    notice.setAttribute('role', 'status');
    const message = document.createElement('span');
    message.textContent = text('saved', result.name);
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.textContent = text('reveal');
    reveal.onclick = () => { void window.folioPDF.reveal(result.token).catch((error) => toast(text('failed', error.message))); };
    notice.append(message, reveal);
    document.body.append(notice);
    setTimeout(() => notice.remove(), 15000);
  }
  form.onchange = updatePreview;
  form.onsubmit = (event) => {
    event.preventDefault();
    if (busy || !allowWrite() || document.documentElement.hasAttribute('data-busy')) return;
    if (!buildPrintModel(album, options()).pages.length) return toast(text('empty'));
    requestId = crypto.randomUUID();
    const config = { albumId: album.id, options: options(), language };
    setBusy(true);
    if (window.folioPDF) {
      button.textContent = text('exporting');
      void window.folioPDF.export({ ...config, requestId }).then(saved, failed);
      return;
    }
    browser = new BroadcastChannel(`folio-print-${requestId}`);
    const url = new URL('/print.html', location.origin);
    url.hash = requestId;
    // Only this fixed same-origin document may open; no user-controlled URL or markup.
    popup = window.open(url.href, `folio-print-${requestId}`, 'popup,width=1100,height=800');
    if (!popup) return failed(new Error(text('blocked')));
    browser.onmessage = ({ data }) => {
      if (closed) return;
      if (data?.type === 'request') browser.postMessage({ type: 'config', config });
      if (data?.type === 'ready') {
        clearTimeout(timeout);
        button.textContent = text('exporting');
        browser.postMessage({ type: 'print' });
      }
      if (data?.type === 'done') cleanup();
      if (data?.type === 'error') failed(new Error(data.error));
    };
    timer = setInterval(() => { if (popup?.closed) failed(new Error(text('unavailable'))); }, 250);
    timeout = setTimeout(() => failed(new Error(text('unavailable'))), 120000);
  };
  d.querySelector('[data-act=cancel]').onclick = cleanup;
  d.addEventListener('close', cleanup, { once: true });
  d.addEventListener('cancel', (event) => { event.preventDefault(); cleanup(); });
  window.addEventListener('pagehide', cleanup, { once: true });
  window.addEventListener('hashchange', cleanup, { once: true });
  document.body.append(d);
  d.showModal();
  resize = new ResizeObserver(scalePreview);
  resize.observe(preview);
  updatePreview();
  activeCleanup = cleanup;
  return cleanup;
}
