import { renderSVG } from 'uqr';
import { api } from './api.js';
import { icon, toast } from './ui.js';

export async function openPhoneDialog() {
  const d = document.createElement('dialog');
  d.className = 'dlg phone off';
  d.innerHTML = `
    <div class="mh"><h3>用手机看相册</h3><button class="ibtn" type="button" data-act="close" aria-label="关闭">${icon('close')}</button></div>
    <p class="dlg-text">手机和这台电脑连同一个 Wi‑Fi，用手机相机扫下面的码。</p>
    <div class="qr"></div>
    <div class="ub"><code></code><button class="btn" type="button" data-act="copy">${icon('copy')}<span>复制</span></button></div>
    <label class="tg"><span><b>允许手机访问</b><small>关掉后，手机马上打不开</small></span><input class="sw" type="checkbox"></label>
    <p class="err" hidden>这台电脑没有连接局域网</p>`;
  const sw = d.querySelector('.sw');
  let info = null;

  function render() {
    const url = info.ip ? `http://${info.ip}:${info.port}/?key=${info.key}` : '';
    const on = info.enabled && !!url;
    d.classList.toggle('off', !on);
    sw.checked = info.enabled;
    sw.disabled = !url;
    d.querySelector('.err').hidden = !!url;
    d.querySelector('code').textContent = on ? url : '打开下面的开关后显示链接';
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
      toast(`操作失败：${err.message}`);
    }
  });
  d.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') d.close();
    else if (act === 'copy') {
      navigator.clipboard.writeText(d.querySelector('code').textContent).then(
        () => toast('已复制'),
        () => toast('复制失败，请手动复制'),
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
    toast(`加载失败：${err.message}`);
    d.close();
  }
}
