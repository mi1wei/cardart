import { renderSVG } from 'uqr';
import { api } from './api.js';
import { icon, toast } from './ui.js';
import { t } from './i18n.js';

export async function openPhoneDialog() {
  const d = document.createElement('dialog');
  d.className = 'dlg phone off';
  d.innerHTML = `
    <div class="mh"><h3>${t('phone-title')}</h3><button class="ibtn" type="button" data-act="close" aria-label="${t('close')}">${icon('close')}</button></div>
    <p class="dlg-text">${t('phone-help')}</p>
    <div class="qr"></div>
    <div class="ub"><code></code><button class="btn" type="button" data-act="copy">${icon('copy')}<span>${t('copy')}</span></button></div>
    <p class="note">${t('phone-note')}</p>
    <label class="tg"><span><b>${t('phone-allow')}</b><small>${t('phone-allow-help')}</small></span><input class="sw" type="checkbox"></label>
    <p class="err" hidden>${t('phone-no-lan')}</p>`;
  const sw = d.querySelector('.sw');
  let info = null;

  function render() {
    const url = info.ip ? `http://${info.ip}:${info.port}/?key=${info.key}` : '';
    const on = info.enabled && !!url;
    d.classList.toggle('off', !on);
    sw.checked = info.enabled;
    sw.disabled = !url;
    d.querySelector('.err').hidden = !!url;
    d.querySelector('code').textContent = on ? url : t('phone-link-off');
    d.querySelector('.qr').innerHTML = on ? renderSVG(url, { border: 1 }) : '';
    d.querySelector('[data-act=copy]').disabled = !on;
  }

  // Every switch-on makes a new key on the server, so old links stop working (spec §9).
  sw.addEventListener('change', async () => {
    try {
      info = await api.setPhone(sw.checked);
      render();
    } catch (err) {
      sw.checked = !sw.checked;
      toast(t('failed', { reason: err.message }));
    }
  });
  d.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') d.close();
    else if (act === 'copy') {
      navigator.clipboard.writeText(d.querySelector('code').textContent).then(
        () => toast(t('copied')),
        () => toast(t('copy-failed')),
      );
    }
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  try {
    info = await api.phone();
    render();
  } catch (err) {
    toast(t('load-failed', { reason: err.message }));
    d.close();
  }
}
