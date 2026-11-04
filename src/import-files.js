import { api } from './api.js';
import { t } from './i18n.js';
import { allowWrite } from './license.js';
import { onComputer } from './phone.js';
import { probeVideo } from './video-probe.js';

const SKIP = { duplicate: 'dup', unsupported: 'bad', 'too-large': 'big' };
const FAILURE = { timeout: 'video-timeout', blocked: 'video-blocked', unreadable: 'video-unreadable', network: 'upload-network', 'bad-response': 'upload-bad-response' };
const isVideo = (file) => /\.(mp4|mov|m4v)$/i.test(file.name) || /^(video\/mp4|video\/quicktime|video\/x-m4v)$/i.test(file.type);
const fresh = () => ({ total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 });

// The import queue and its progress box, shared by the album page and the album wall (polish spec §5).
// Files go up one at a time (v1 spec §7) and files added during a run join it; html[data-busy] holds
// other changes and quitting until the run ends. beforeFile() runs before each upload and its result
// reaches onPhoto(photo, { signal, before }), which may return a note for the summary; onDone() runs
// once the queue is empty, before the summary.
export function createImporter(host, { beforeFile, onPhoto, onDone } = {}) {
  host.insertAdjacentHTML('beforeend', '<div class="upload" role="status" aria-live="polite" hidden><div class="r"><b></b><span></span></div><div class="prog"><i></i></div><small></small></div>');
  const box = host.lastElementChild;
  const heading = box.querySelector('b');
  const current = box.querySelector('.r span');
  const bar = box.querySelector('.prog i');
  const result = box.querySelector('small');
  const queue = [];
  const tally = fresh();
  let lastFailure = '';
  let active = false;
  let dead = false;
  let controller = null;

  function summary() {
    const skipped = tally.dup + tally.bad + tally.big;
    const why = [tally.dup && t('dup', { n: tally.dup }), tally.bad && t('bad', { n: tally.bad }), tally.big && t('big', { n: tally.big })]
      .filter(Boolean)
      .join(t('sep'));
    return t('imported', { n: tally.done }) + (skipped ? t('skipped', { n: skipped, why }) : '') + (tally.fail ? t('failed-n', { n: tally.fail }) : '') +
      (lastFailure ? ` · ${lastFailure}` : '');
  }

  async function run() {
    active = true;
    document.documentElement.setAttribute('data-busy', '');
    box.hidden = false;
    clearTimeout(box.timer);
    result.textContent = '';
    try {
      while (queue.length && !dead) {
        if (!allowWrite()) { queue.length = 0; break; }
        const { album, file } = queue.shift();
        const i = tally.total - queue.length;
        const before = beforeFile?.();
        controller = new AbortController();
        const { signal } = controller;
        heading.textContent = t('importing', { i, n: tally.total });
        current.textContent = file.name;
        bar.style.width = `${((i - 1) / tally.total) * 100}%`;
        try {
          let res;
          if (isVideo(file)) {
            heading.textContent = `${t('video-preparing')} · ${i}/${tally.total}`;
            const prepared = await probeVideo(file, { signal });
            if (dead || !allowWrite()) { queue.length = 0; break; }
            res = await api.uploadVideo(album, file, prepared, ({ stage, loaded, total }) => {
              if (dead) return;
              heading.textContent = `${t(stage === 'saving' ? 'upload-saving' : onComputer ? 'upload-sending' : 'upload-sending-phone')} · ${i}/${tally.total}`;
              const fraction = total > 0 ? Math.min(1, Math.max(0, loaded / total)) : 0;
              bar.style.width = `${((i - 1 + fraction) / tally.total) * 100}%`;
            }, { signal });
          } else if (/^video\//i.test(file.type)) res = { skipped: 'unsupported' };
          else res = await api.upload(album, file, { signal });
          if (dead) break;
          if (res.photo) {
            tally.done++;
            const note = await onPhoto?.(res.photo, { signal, before });
            if (dead) break;
            if (note) lastFailure = note;
          } else if (SKIP[res.skipped]) tally[SKIP[res.skipped]]++;
          else throw Object.assign(new Error('Invalid upload response'), { code: 'bad-response' });
        } catch (error) {
          if (dead || error.name === 'AbortError') continue;
          if (SKIP[error.code]) tally[SKIP[error.code]]++;
          else {
            tally.fail++;
            const key = FAILURE[error.code];
            lastFailure = `${file.name.slice(0, 200)}: ${key ? t(key) : error.message}`;
          }
        }
      }
    } finally {
      controller = null;
      active = false;
      document.documentElement.removeAttribute('data-busy');
    }
    if (dead) return;
    await onDone?.();
    // Files added meanwhile started another run; it carries these counts on to its own summary.
    if (dead || active) return;
    const failed = Boolean(lastFailure);
    heading.textContent = t('import-done');
    current.textContent = '';
    bar.style.width = '100%';
    result.textContent = summary();
    Object.assign(tally, fresh());
    lastFailure = '';
    if (!failed) box.timer = setTimeout(() => (box.hidden = true), 4000);
  }

  return {
    get active() { return active; },
    add({ album, files }) {
      const list = [...files];
      for (const file of list) queue.push({ album, file });
      tally.total += list.length;
      if (!active && !dead) void run();
    },
    destroy() {
      dead = true;
      controller?.abort();
      queue.length = 0;
      clearTimeout(box.timer);
    },
  };
}
