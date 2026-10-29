import { api } from './api.js';
import { lang, t } from './i18n.js';
import { onComputer } from './phone.js';
import { icon, toast } from './ui.js';

let state = { state: 'loading', canWrite: false };
let revision = 0;
let banner;
let viewingLicense = false;

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
    banner.hidden = viewingLicense || canWrite() || state.state === 'loading';
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
  viewingLicense = true;
  document.title = `${t('license-title')} · ${t('app')}`;
  app.innerHTML = `
    <main class="page license-page">
      <header class="ph license-heading">
        <div><h1 class="t1">${t('license-title')}</h1><p class="sub">${t('license-help')}</p></div>
        <span class="license-offline">${icon('shield')}<span>${t('license-offline')}</span></span>
      </header>
      <section class="license-workspace">
        <section class="license-status-panel" aria-labelledby="license-status-title">
          <div class="license-overline"><span>${t('license-current-status')}</span><span class="license-status-badge"></span></div>
          <div class="license-status" role="status" aria-live="polite">
            <div class="license-status-icon" aria-hidden="true"></div>
            <h2 class="license-status-title" id="license-status-title"></h2>
            <p class="license-status-description"></p>
          </div>
          <dl class="license-facts">
            <div class="license-plan-row"><dt>${t('license-type')}</dt><dd class="license-plan"></dd></div>
            <div class="license-expiry-row"><dt class="license-expiry-label"></dt><dd><time class="license-expiry-date"></time><small class="license-expiry-time"></small></dd></div>
          </dl>
          <div class="license-safety">${icon('shieldCheck')}<div><strong>${t('license-safety-title')}</strong><p>${t('license-safety-body')}</p></div></div>
          <button class="btn ghost license-refresh" type="button" data-act="refresh-license">${icon('refresh')}<span>${t('license-refresh')}</span></button>
        </section>
        <section class="license-activate-panel" aria-labelledby="license-activate-title">
          <h2 class="license-activate-title" id="license-activate-title"></h2>
          <p class="license-activate-description"></p>
          <form class="license-form" novalidate>
            <div class="license-file-box">
              <div class="license-file-heading"><span class="license-file-icon">${icon('file')}</span><div><strong>${t('license-file-title')}</strong><small>${t('license-file-hint')}</small></div></div>
              <input id="license-file" type="file" accept=".json,application/json" hidden aria-label="${t('license-file')}">
              <button class="btn pri license-choose" type="button" data-act="choose-license">${icon('plus')}<span>${t('license-file')}</span></button>
            </div>
            <div class="license-file-picked" hidden>
              ${icon('file')}<span class="license-selected-info"><span class="license-selected-name"></span><small class="license-selected-meta"></small></span>
              <button class="ibtn" type="button" data-act="clear-license" aria-label="${t('license-file-remove')}">${icon('close')}</button>
            </div>
            <details class="license-json-details">
              <summary>${icon('code')}<span>${t('license-json')}</span><span class="license-chevron">${icon('chevronDown')}</span></summary>
              <div class="license-json-body"><p>${t('license-json-help')}</p><label for="license-json">${t('license-json-label')}</label>
                <textarea id="license-json" rows="5" spellcheck="false" autocomplete="off" placeholder='{"payload": "...", "signature": "..."}'></textarea>
              </div>
            </details>
            <div class="license-import-actions">
              <button class="btn pri license-import" type="submit" data-act="activate-license" disabled>${icon('check')}<span>${t('license-import')}</span></button>
              <span class="license-local">${icon('shield')}<span>${t('license-local')}</span></span>
            </div>
            <p class="license-result" role="alert" hidden></p>
          </form>
          <div class="license-computer" hidden>${icon('laptop')}<strong></strong><p></p></div>
          <details class="license-help-details"><summary>${icon('info')}<span>${t('license-about')}</span><span class="license-chevron">${icon('chevronDown')}</span></summary><p>${t('license-about-body')}</p></details>
        </section>
      </section>
    </main>`;
  const form = app.querySelector('form');
  const file = app.querySelector('#license-file');
  const input = app.querySelector('#license-json');
  const disclosure = app.querySelector('.license-json-details');
  const result = app.querySelector('.license-result');
  const submit = app.querySelector('[data-act=activate-license]');
  const choose = app.querySelector('[data-act=choose-license]');
  const clear = app.querySelector('[data-act=clear-license]');
  const refresh = app.querySelector('[data-act=refresh-license]');
  let alive = true;
  let submitting = false;
  let reading = false;
  let refreshing = false;
  let source = null;
  let selectedText = '';
  let selectedName = '';
  function syncBusy() {
    const busy = submitting || reading;
    for (const control of [file, input, choose, clear]) control.disabled = busy;
    submit.disabled = busy || !source || (source === 'json' && !input.value.trim());
    submit.querySelector('span').textContent = t(submitting ? 'license-importing' : 'license-import');
    form.setAttribute('aria-busy', String(busy));
    refresh.disabled = busy || refreshing;
    refresh.querySelector('span').textContent = t(refreshing ? 'license-refreshing' : 'license-refresh');
    choose.querySelector('span').textContent = t(selectedName ? 'license-file-replace' : 'license-file');
    choose.classList.toggle('pri', !selectedName && source !== 'json');
    app.querySelector('.license-file-picked').hidden = !selectedName;
    app.querySelector('.license-selected-name').textContent = selectedName;
    app.querySelector('.license-selected-meta').textContent = t(reading ? 'license-file-reading' : 'license-file-selected');
  }
  function showResult(message, success = false) {
    result.hidden = false;
    result.textContent = message;
    result.dataset.result = success ? 'success' : 'error';
  }
  function clearResult() {
    result.hidden = true;
    result.textContent = '';
  }
  function clearFile() {
    file.value = '';
    selectedText = '';
    selectedName = '';
    if (source === 'file') source = null;
  }
  function update() {
    let kind = state.state;
    if (kind === 'active' && state.expiresAt && Date.parse(state.expiresAt) <= Date.now()) kind = 'expired';
    if (kind === 'expired' && state.plan === 'trial') kind = 'trial-expired';
    if (kind === 'active') kind = !canWrite() ? 'readonly' : state.plan === 'trial' ? 'trial-active' : 'active';
    const active = kind === 'active' || kind === 'trial-active';
    const expired = kind === 'expired' || kind === 'trial-expired';
    app.querySelector('.license-workspace').dataset.tone = active ? 'active' : expired ? 'expired' : kind === 'invalid' ? 'invalid' : 'neutral';
    app.querySelector('.license-status-title').textContent = t(`license-state-${kind}`);
    app.querySelector('.license-status-description').textContent = t(`license-description-${kind}`);
    app.querySelector('.license-status-icon').innerHTML = icon(active ? 'check' : expired ? 'clock' : kind === 'invalid' || kind === 'error' ? 'info' : kind === 'loading' ? 'refresh' : 'shield');
    app.querySelector('.license-status-badge').textContent = t(kind === 'loading' ? 'license-checking' : canWrite() ? 'license-editing' : 'license-viewonly');
    app.querySelector('.license-status').setAttribute('aria-busy', String(kind === 'loading' || refreshing));
    const plan = ['trial', 'pro'].includes(state.plan);
    const expiry = typeof state.expiresAt === 'string' ? new Date(state.expiresAt) : null;
    const validExpiry = expiry && Number.isFinite(expiry.getTime());
    app.querySelector('.license-facts').hidden = !plan && !validExpiry;
    app.querySelector('.license-plan-row').hidden = !plan;
    app.querySelector('.license-plan').textContent = plan ? t(`license-plan-${state.plan}`) : '';
    app.querySelector('.license-expiry-row').hidden = !validExpiry;
    if (validExpiry) {
      const locale = lang() === 'zh' ? 'zh-CN' : 'en';
      const date = app.querySelector('.license-expiry-date');
      date.dateTime = state.expiresAt;
      date.textContent = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(expiry);
      app.querySelector('.license-expiry-time').textContent = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(expiry);
    }
    app.querySelector('.license-expiry-label').textContent = t(expired ? 'license-expired-on' : 'license-expires-on');
    app.querySelector('.license-activate-title').textContent = t(active ? 'license-renew-title' : 'license-activate-title');
    app.querySelector('.license-activate-description').textContent = t(active ? 'license-renew-help' : 'license-activate-help');
    form.hidden = !onComputer || state.state === 'development';
    const restricted = app.querySelector('.license-computer');
    restricted.hidden = !form.hidden;
    restricted.querySelector('strong').textContent = t(state.state === 'development' ? 'license-development-title' : 'license-computer-title');
    restricted.querySelector('p').textContent = t(state.state === 'development' ? 'license-development' : 'license-computer');
    syncBusy();
  }
  refresh.onclick = async () => {
    if (refreshing) return;
    refreshing = true;
    update();
    try { await refreshLicense(); }
    finally { refreshing = false; if (alive) update(); }
  };
  choose.onclick = () => { file.value = ''; file.click(); };
  clear.onclick = () => { clearFile(); clearResult(); syncBusy(); };
  input.oninput = () => {
    if (input.value.trim()) { clearFile(); source = 'json'; }
    else if (source === 'json') source = null;
    clearResult();
    syncBusy();
  };
  file.onchange = async () => {
    if (reading || submitting) return;
    const selected = file.files[0];
    if (!selected) return;
    clearFile();
    source = null;
    input.value = '';
    disclosure.open = false;
    clearResult();
    if (selected.size > 8192) { showResult(t('license-too-large')); syncBusy(); return; }
    selectedName = selected.name;
    reading = true;
    syncBusy();
    try {
      const contents = await selected.text();
      if (!alive) return;
      selectedText = contents;
      source = 'file';
    } catch {
      if (alive) { clearFile(); showResult(t('license-file-failed')); }
    }
    finally { reading = false; if (alive) syncBusy(); }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submitting || reading || !source || !onComputer || state.state === 'development') return;
    const contents = source === 'file' ? selectedText : input.value;
    if (new TextEncoder().encode(contents).length > 8192) return showResult(t('license-too-large'));
    let envelope;
    try { envelope = JSON.parse(contents.replace(/^\uFEFF/, '')); }
    catch { return showResult(t('license-bad-json')); }
    submitting = true;
    clearResult();
    syncBusy();
    try {
      const next = await api.activateLicense(envelope);
      revision++;
      setState(next);
      if (alive) {
        clearFile();
        source = null;
        input.value = '';
        disclosure.open = false;
        showResult(t('license-success'), true);
      }
    } catch (error) {
      if (alive) showResult(error.message);
    } finally { submitting = false; if (alive) syncBusy(); }
  };
  window.addEventListener('folio-license-state', update);
  display();
  void refreshLicense();
  return { destroy() { alive = false; window.removeEventListener('folio-license-state', update); viewingLicense = false; display(); } };
}
