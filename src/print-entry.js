import { buildPrintModel, renderPrintPage, waitForPrintImages } from './print-layout.js';
import { pdfText } from './pdf-text.js';
import './print-layout.css';

const root = document.querySelector('#print-pages');
const token = location.hash.slice(1);
let channel;
let language = 'en';
let started = false;
let disposed = false;
const controller = new AbortController();
let waiting;

function cleanup() {
  if (disposed) return;
  disposed = true;
  controller.abort();
  clearInterval(waiting);
  channel?.close();
}

async function prepare(config) {
  if (started || disposed) return;
  started = true;
  clearInterval(waiting);
  try {
    if (!/^[0-9a-f-]{36}$/i.test(config.albumId)) throw new Error('Invalid album');
    language = config.language === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = language;
    const response = await fetch(`/api/albums/${config.albumId}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const album = await response.json();
    const model = buildPrintModel(album, config.options, language);
    if (!model.pages.length) throw new Error(pdfText('empty', null, language));
    const rule = document.createElement('style');
    rule.textContent = `@page { size: ${model.paper.width}mm ${model.paper.height}mm; margin: 0; }`;
    document.head.append(rule);
    document.title = `${album.title} · PDF`;
    root.replaceChildren(...model.pages.map((page) => renderPrintPage(model, page, pdfText('video', null, language))));
    await waitForPrintImages(root, controller.signal);
    if (window.folioPrint) {
      await window.folioPrint.ready({ title: album.title });
    } else {
      const controls = document.querySelector('.print-controls');
      controls.hidden = false;
      controls.querySelector('p').textContent = pdfText('printHint', null, language);
      controls.querySelector('button').textContent = pdfText('print', null, language);
      controls.querySelector('button').onclick = () => window.print();
      channel.postMessage({ type: 'ready' });
    }
  } catch (error) {
    if (disposed) return;
    root.textContent = pdfText('failed', error.message, language);
    if (window.folioPrint) await window.folioPrint.ready({ error: error.message }).catch(() => {});
    else channel.postMessage({ type: 'error', error: error.message });
  }
}

window.addEventListener('pagehide', cleanup, { once: true });
window.addEventListener('afterprint', () => {
  channel?.postMessage({ type: 'done' });
}, { once: true });

if (window.folioPrint) {
  void window.folioPrint.config().then(prepare).catch((error) => { root.textContent = error.message; });
} else if (/^[0-9a-f-]{36}$/i.test(token)) {
  // The random, per-export channel carries structured options only, never markup or file paths.
  window.opener = null;
  channel = new BroadcastChannel(`folio-print-${token}`);
  channel.onmessage = ({ data }) => {
    if (data?.type === 'config') void prepare(data.config);
    if (data?.type === 'print' && started && !disposed) window.print();
    if (data?.type === 'cancel') { cleanup(); window.close(); }
  };
  const request = () => channel.postMessage({ type: 'request' });
  waiting = setInterval(request, 200);
  request();
} else {
  root.textContent = 'Folio · PDF';
}
