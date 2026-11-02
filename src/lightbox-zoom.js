import { lt } from './lightbox-text.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createPhotoZoom(root, { media, onSwipe, onZoom }) {
  const stage = root.querySelector('.lb-stage');
  const image = root.querySelector('.lb-img');
  const controls = document.createElement('div');
  controls.className = 'lb-zoom';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', lt('zoom'));
  controls.innerHTML = `
    <button type="button" data-act="zoom-out" aria-label="${lt('zoom-out')}">−</button>
    <button type="button" data-act="fit" aria-label="${lt('fit')}">${lt('fit')}</button>
    <output class="lb-zoom-value" aria-live="polite"></output>
    <button type="button" data-act="zoom-in" aria-label="${lt('zoom-in')}">+</button>
    <button type="button" data-act="actual" aria-label="${lt('actual')}">1:1</button>`;
  const map = document.createElement('div');
  map.className = 'lb-minimap';
  map.setAttribute('role', 'img');
  map.setAttribute('aria-label', lt('minimap'));
  map.innerHTML = '<img alt="" draggable="false"><span class="lb-minimap-viewport"></span>';
  root.append(controls, map);
  const viewport = map.querySelector('span');
  const events = new AbortController();
  const pointers = new Map();
  let photo;
  let width = 0;
  let height = 0;
  let fit = 1;
  let ratio = 1;
  let x = 0;
  let y = 0;
  let start;
  let pinch;
  let multiple = false;
  let mapPointer = null;
  const enabled = () => photo && photo.kind !== 'video';
  const zoomed = () => enabled() && ratio > 1.001;

  function render() {
    const w = (photo?.w || 1) * fit * ratio;
    const h = (photo?.h || 1) * fit * ratio;
    x = clamp(x, -Math.max(0, (w - width) / 2), Math.max(0, (w - width) / 2));
    y = clamp(y, -Math.max(0, (h - height) / 2), Math.max(0, (h - height) / 2));
    image.style.width = `${(photo?.w || 1) * fit}px`;
    image.style.height = `${(photo?.h || 1) * fit}px`;
    image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${ratio})`;
    root.dataset.zoomed = String(Boolean(zoomed()));
    controls.hidden = !enabled();
    map.hidden = !zoomed();
    controls.querySelector('output').textContent = `${Math.round(fit * ratio * 100)}%`;
    controls.querySelector('[data-act=fit]').setAttribute('aria-pressed', String(Math.abs(ratio - 1) < 0.001));
    controls.querySelector('[data-act=actual]').setAttribute('aria-pressed', String(Math.abs(fit * ratio - 1) < 0.001));
    controls.querySelector('[data-act=zoom-out]').disabled = ratio <= 1;
    if (enabled()) {
      map.style.width = `${Math.min(150, 100 * photo.w / photo.h)}px`;
      map.style.aspectRatio = `${photo.w} / ${photo.h}`;
      const vw = Math.min(1, width / w);
      const vh = Math.min(1, height / h);
      viewport.style.width = `${vw * 100}%`;
      viewport.style.height = `${vh * 100}%`;
      viewport.style.left = `${clamp((1 - vw) / 2 - x / w, 0, 1 - vw) * 100}%`;
      viewport.style.top = `${clamp((1 - vh) / 2 - y / h, 0, 1 - vh) * 100}%`;
    }
  }
  function layout() {
    const box = stage.getBoundingClientRect();
    width = box.width;
    height = box.height;
    fit = photo && width && height ? Math.min(width / photo.w, height / photo.h) : 1;
    render();
  }
  function setRatio(value, point, belowFit = false) {
    if (!enabled()) return;
    const next = clamp(value, belowFit ? Math.min(1, 1 / fit) : 1, Math.max(16, 1 / fit));
    if (point) {
      const box = stage.getBoundingClientRect();
      const px = point.x - box.left - width / 2;
      const py = point.y - box.top - height / 2;
      x = px - (px - x) * next / ratio;
      y = py - (py - y) * next / ratio;
    }
    ratio = next;
    render();
    if (zoomed()) onZoom?.(photo);
  }
  function reset() { ratio = 1; x = 0; y = 0; render(); }
  function pair() {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function capture(element, event) {
    if (event.isTrusted) {
      try { element.setPointerCapture(event.pointerId); } catch {}
    }
  }
  stage.addEventListener('wheel', (event) => {
    if (!enabled() || event.target.closest('video, button')) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    setRatio(ratio * Math.exp(-clamp(delta, -1000, 1000) * 0.002), { x: event.clientX, y: event.clientY });
  }, { passive: false, signal: events.signal });
  stage.addEventListener('dblclick', (event) => {
    if (!enabled() || event.target.closest('video, button')) return;
    event.preventDefault();
    if (zoomed()) reset();
    else setRatio(Math.max(2, 1 / fit), { x: event.clientX, y: event.clientY });
  }, { signal: events.signal });
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('video, button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capture(stage, event);
    if (pointers.size === 1) {
      start = { x: event.clientX, y: event.clientY, panX: x, panY: y, zoomed: zoomed() };
      multiple = false;
      root.classList.toggle('lb-panning', Boolean(zoomed()));
    } else {
      multiple = true;
      if (enabled() && pointers.size === 2) pinch = { ...pair(), ratio };
    }
  }, { signal: events.signal });
  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch && enabled()) {
      const next = pair();
      setRatio(pinch.ratio * next.distance / Math.max(1, pinch.distance), pinch);
      x += next.x - pinch.x;
      y += next.y - pinch.y;
      pinch = { ...next, ratio };
      render();
    } else if (pointers.size === 1 && start?.zoomed && !multiple) {
      x = start.panX + event.clientX - start.x;
      y = start.panY + event.clientY - start.y;
      render();
    }
  }, { signal: events.signal });
  function finish(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      root.classList.remove('lb-panning');
      if (event.type === 'pointerup' && start && !multiple && !start.zoomed && !zoomed()) onSwipe(event.clientX - start.x, event.clientY - start.y);
      start = null;
      pinch = null;
      multiple = false;
    }
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(name, finish, { signal: events.signal });
  function panMap(event) {
    const box = map.getBoundingClientRect();
    x = (0.5 - clamp((event.clientX - box.left) / box.width, 0, 1)) * photo.w * fit * ratio;
    y = (0.5 - clamp((event.clientY - box.top) / box.height, 0, 1)) * photo.h * fit * ratio;
    render();
  }
  map.addEventListener('pointerdown', (event) => { mapPointer = event.pointerId; capture(map, event); panMap(event); }, { signal: events.signal });
  map.addEventListener('pointermove', (event) => { if (mapPointer === event.pointerId) panMap(event); }, { signal: events.signal });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) map.addEventListener(name, () => { mapPointer = null; }, { signal: events.signal });
  const observer = new ResizeObserver(layout);
  observer.observe(stage);
  return {
    get zoomed() { return Boolean(zoomed()); },
    setPhoto(next) {
      photo = next;
      pointers.clear();
      start = null;
      pinch = null;
      multiple = false;
      map.querySelector('img').src = media(next, 600);
      reset();
      layout();
    },
    reset,
    act(name) {
      if (!enabled()) return;
      if (name === 'fit') reset();
      else if (name === 'actual') setRatio(1 / fit, null, true);
      else if (name === 'zoom-in') setRatio(Math.max(1, ratio) * 1.5);
      else if (name === 'zoom-out') setRatio(ratio / 1.5);
    },
    dispose() { events.abort(); observer.disconnect(); controls.remove(); map.remove(); pointers.clear(); },
  };
}
