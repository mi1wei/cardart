import { renderSVG } from 'uqr';
import { api } from './api.js';
import { icon, toast } from './ui.js';
import { t } from './i18n.js';

// Phone access is set up on the computer only (spec §12).
export const onComputer = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export async function openPhoneDialog() {
  const d = document.createElement('dialog');
  d.className = 'dlg phone off';
  d.innerHTML = `
    <div class="mh"><h3>${t('phone-title')}</h3><button class="ibtn" type="button" data-act="close" aria-label="${t('close')}">${icon('close')}</button></div>
    <p class="dlg-text">${t('phone-help')}</p>
    <label class="phone-network" hidden><span>${t('phone-network')}</span><select></select></label>
    <div class="qr"></div>
    <div class="ub"><code></code><button class="btn" type="button" data-act="copy">${icon('copy')}<span>${t('copy')}</span></button></div>
    <p class="note">${t('phone-note')}</p>
    <label class="tg"><span><b>${t('phone-allow')}</b><small>${t('phone-allow-help')}</small></span><input class="sw" type="checkbox"></label>
    <p class="err" hidden>${t('phone-no-lan')}</p>`;
  const sw = d.querySelector('.sw');
  const network = d.querySelector('select');
  sw.disabled = true;
  let info = null;
  let saving = false;

  function render() {
    const previous = network.value || info.ip;
    const addresses = info.addresses?.length ? info.addresses : info.ip ? [{ address: info.ip, name: '' }] : [];
    network.replaceChildren(...addresses.map(({ name, address }) => new Option(name ? `${name} (${address})` : address, address)));
    network.value = addresses.some(({ address }) => address === previous) ? previous : addresses[0]?.address ?? '';
    network.disabled = saving;
    d.querySelector('.phone-network').hidden = addresses.length < 2;
    const url = network.value ? `http://${network.value}:${info.port}/?key=${info.key}` : '';
    const on = info.enabled && !!url;
    d.classList.toggle('off', !on);
    sw.checked = info.enabled;
    sw.disabled = saving || !url;
    d.querySelector('.err').hidden = !!url;
    d.querySelector('code').textContent = on ? url : t('phone-link-off');
    d.querySelector('.qr').innerHTML = on ? renderSVG(url, { border: 1 }) : '';
    d.querySelector('[data-act=copy]').disabled = !on;
  }
  network.addEventListener('change', render);

  // Every switch-on makes a new key on the server, so old links stop working (spec §9).
  sw.addEventListener('change', async () => {
    saving = true;
    sw.disabled = true;
    network.disabled = true;
    try {
      info = await api.setPhone(sw.checked);
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    } finally {
      saving = false;
      render();
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
