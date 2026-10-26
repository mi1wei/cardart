import './style.css';
import { renderAlbum } from './album.js';
import { start } from './router.js';
import { icon } from './ui.js';
import { renderWall } from './wall.js';

const app = document.querySelector('#app');
let view = null;

// WeChat's browser cannot go full screen: point to Safari and the Home Screen (spec §9).
if (/MicroMessenger/i.test(navigator.userAgent)) {
  const tip = document.createElement('p');
  tip.className = 'wx-tip';
  tip.innerHTML = `<span>微信里不能全屏：点右上角「···」→「在 Safari 中打开」，再点分享 →「添加到主屏幕」。</span><button class="ibtn" type="button" aria-label="关闭">${icon('close')}</button>`;
  tip.querySelector('button').onclick = () => tip.remove();
  document.body.prepend(tip);
}

start((route) => {
  const key = route.album ?? 'wall';
  if (view?.key !== key) {
    view?.destroy();
    view = { key, ...(route.album ? renderAlbum(app, route.album) : renderWall(app)) };
    scrollTo(0, 0);
  }
  view.update?.(route);
});
