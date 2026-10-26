import './style.css';
import { renderAlbum } from './album.js';
import { start } from './router.js';
import { renderWall } from './wall.js';

const app = document.querySelector('#app');
let view = null;

start((route) => {
  const key = route.album ?? 'wall';
  if (view?.key !== key) {
    view?.destroy();
    view = { key, ...(route.album ? renderAlbum(app, route.album) : renderWall(app)) };
    scrollTo(0, 0);
  }
  view.update?.(route);
});
