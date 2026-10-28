import { api } from './api.js';
import { lang, t } from './i18n.js';
import { onComputer } from './phone.js';
import { toast } from './ui.js';

let state = { state: 'loading', canWrite: false };
let revision = 0;
let banner;

export function canWrite() {
  if (!state.canWrite || !['active', 'development'].includes(state.state)) return false;
  return !onComputer || !state.expiresAt || Date.now() < Date.parse(state.expiresAt);
}

export function allowWrite() {
  if (canWrite()) return true;
  toast(t('license-readonly'));
  return false;
}

function applyControls() {
  const readonly = !canWrite();
  document.documentElement.dataset.readonly = String(readonly);
  for (const control of document.querySelectorAll('[data-write]')) {
    if (control.inert !== readonly) control.inert = readonly;
    if (readonly) control.setAttribute('aria-disabled', 'true');
    else control.removeAttribute('aria-disabled');
  }
}

function display() {
  applyControls();
  if (banner) {
    banner.hidden = canWrite() || state.state === 'loading';
    banner.querySelector('span').textContent = t(state.state === 'error' ? 'license-unavailable' : 'license-readonly');
    const link = banner.querySelector('a');
    link.hidden = !onComputer;
    link.textContent = t('license-manage');
  }
  window.dispatchEvent(new Event('folio-license-state'));
}

function setState(value) {
  state = value && ['active', 'expired', 'invalid', 'missing', 'development'].includes(value.state) && typeof value.canWrite === 'boolean'
    ? value : { state: 'error', canWrite: false };
  display();
}

export async function refreshLicense() {
  const request = ++revision;
  try {
    const next = await api.license();
    if (request === revision) setState(next);
  } catch {
    if (request === revision) setState(null);
  }
}

export function initLicense(nav) {
  banner = document.createElement('div');
  banner.className = 'license-bar';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<span></span><a href="#/license"></a>';
  nav.after(banner);
  new MutationObserver(applyControls).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshLicense(); });
  window.addEventListener('focus', () => { void refreshLicense(); });
  setInterval(() => { void refreshLicense(); }, 60000);
  void refreshLicense();
}

export function renderLicense(app) {
  document.title = `${t('license-title')} · ${t('app')}`;
  app.innerHTML = `
    <main class="page license-page">
      <header class="ph"><div><h1 class="t1">${t('license-title')}</h1><p class="sub">${t('license-help')}</p></div></header>
      <section class="license-panel">
        <p class="license-status" role="status"></p>
        <button class="btn" type="button" data-act="refresh-license">${t('license-refresh')}</button>
        <form class="license-form">
          <label for="license-file">${t('license-file')}</label>
          <input id="license-file" type="file" accept=".json,application/json">
          <label for="license-json">${t('license-json')}</label>
          <textarea id="license-json" rows="8" spellcheck="false" autocomplete="off"></textarea>
          <button class="btn pri" type="submit" data-act="activate-license">${t('license-import')}</button>
        </form>
        <p class="license-computer"></p>
        <p class="license-result" role="alert"></p>
      </section>
    </main>`;
  const form = app.querySelector('form');
  const file = app.querySelector('#license-file');
  const input = app.querySelector('#license-json');
  const result = app.querySelector('.license-result');
  const submit = form.querySelector('button');
  let alive = true;
  let submitting = false;
  let reading = false;
  function syncBusy() {
    for (const control of [file, input, submit]) control.disabled = submitting || reading;
  }
  function showResult(message, success = false) {
    result.textContent = message;
    result.dataset.result = success ? 'success' : 'error';
  }
  function update() {
    const parts = [t(`license-state-${state.state}`)];
    if (state.plan) parts.push(t(`license-plan-${state.plan}`));
    if (state.expiresAt) parts.push(`${t('license-expires')} ${new Date(state.expiresAt).toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en')}`);
    app.querySelector('.license-status').textContent = parts.join(' - ');
    form.hidden = !onComputer || state.state === 'development';
    app.querySelector('.license-computer').textContent = !onComputer ? t('license-computer') : state.state === 'development' ? t('license-development') : '';
  }
  app.querySelector('[data-act=refresh-license]').onclick = () => { void refreshLicense(); };
  file.onchange = async () => {
    if (reading || submitting) return;
    const selected = file.files[0];
    if (!selected) return;
    if (selected.size > 8192) { showResult(t('license-too-large')); file.value = ''; return; }
    reading = true;
    syncBusy();
    try { input.value = await selected.text(); }
    catch { showResult(t('license-bad-json')); }
    finally { reading = false; if (alive) syncBusy(); }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submitting || reading) return;
    if (new TextEncoder().encode(input.value).length > 8192) return showResult(t('license-too-large'));
    let envelope;
    try { envelope = JSON.parse(input.value.replace(/^\uFEFF/, '')); }
    catch { return showResult(t('license-bad-json')); }
    submitting = true;
    syncBusy();
    try {
      const next = await api.activateLicense(envelope);
      revision++;
      setState(next);
      if (alive) { input.value = ''; file.value = ''; showResult(t('license-success'), true); }
    } catch (error) {
      if (alive) showResult(error.message);
    } finally { submitting = false; if (alive) syncBusy(); }
  };
  window.addEventListener('folio-license-state', update);
  update();
  void refreshLicense();
  return { destroy() { alive = false; window.removeEventListener('folio-license-state', update); } };
}
