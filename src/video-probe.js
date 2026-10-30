import { MAX_POSTER_BYTES, MAX_POSTER_EDGE, MAX_VIDEO_BYTES, MAX_VIDEO_DIMENSION } from '../shared/media.js';

const problem = (code) => Object.assign(new Error(code), { code });
const aborted = () => new DOMException('Aborted', 'AbortError');

export async function probeVideo(file, { signal } = {}) {
  if (signal?.aborted) throw aborted();
  if (file.size > MAX_VIDEO_BYTES) throw problem('too-large');
  if (!file.size) throw problem('unsupported');
  const type = /\.mov$/i.test(file.name) || (!/\.(mp4|m4v)$/i.test(file.name) && file.type === 'video/quicktime')
    ? 'video/quicktime' : 'video/mp4';
  const url = URL.createObjectURL(new Blob([file], { type }));
  const video = document.createElement('video');
  video.muted = video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:fixed;left:-10000px;top:0;width:64px;height:64px;pointer-events:none';
  const controller = new AbortController();
  const active = controller.signal;
  let blocked = false;
  let frameSeen = false;
  let frameId;
  let checkFrame = () => {};
  const stop = (error) => { if (!active.aborted) controller.abort(error); };
  const onAbort = () => stop(aborted());
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => stop(problem(blocked ? 'blocked' : 'timeout')), 15000);
  const stopped = new Promise((_, reject) => {
    active.addEventListener('abort', () => reject(active.reason), { once: true });
  });
  function assertLive() {
    if (active.aborted) throw active.reason;
  }
  function until(predicate) {
    assertLive();
    return new Promise((resolve, reject) => {
      const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked', 'timeupdate', 'playing', 'ended', 'progress'];
      const clean = () => {
        for (const event of events) video.removeEventListener(event, check);
        active.removeEventListener('abort', cancel);
        if (checkFrame === check) checkFrame = () => {};
      };
      const cancel = () => { clean(); reject(active.reason); };
      const check = () => {
        if (active.aborted) return cancel();
        if (predicate()) { clean(); resolve(); }
      };
      for (const event of events) video.addEventListener(event, check);
      active.addEventListener('abort', cancel, { once: true });
      checkFrame = check;
      check();
    });
  }
  function play() {
    try {
      Promise.resolve(video.play()).catch((error) => {
        if (active.aborted || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') { blocked = true; checkFrame(); }
        else stop(problem(error.name === 'NotSupportedError' ? 'unsupported' : 'unreadable'));
      });
    } catch (error) {
      if (error.name === 'NotAllowedError') { blocked = true; checkFrame(); }
      else stop(problem('unreadable'));
    }
  }
  const onError = () => stop(problem([3, 4].includes(video.error?.code) ? 'unsupported' : 'unreadable'));
  video.addEventListener('error', onError);
  document.body.append(video);
  try {
    const work = (async () => {
      if (video.requestVideoFrameCallback) {
        frameId = video.requestVideoFrameCallback(() => { frameSeen = true; checkFrame(); });
      }
      const metadata = until(() => video.readyState >= 1);
      video.src = url;
      video.load();
      play();
      await metadata;
      assertLive();
      const w = video.videoWidth;
      const h = video.videoHeight;
      const duration = video.duration;
      if (![w, h].every((value) => Number.isInteger(value) && value > 0 && value <= MAX_VIDEO_DIMENSION) ||
          !Number.isFinite(duration) || duration <= 0) throw problem('unsupported');
      video.pause();
      const target = Math.min(1, duration / 2);
      if (Math.abs(video.currentTime - target) > 0.001 || video.readyState < 2) {
        const sought = until(() => !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) <= 0.001);
        video.currentTime = target;
        await sought;
      }
      assertLive();
      if (video.requestVideoFrameCallback && !frameSeen && !blocked && !video.ended) {
        play();
        await until(() => video.readyState >= 2 && !video.seeking && (frameSeen || blocked || video.ended));
      } else await until(() => video.readyState >= 2 && !video.seeking);
      assertLive();
      video.pause();
      const scale = Math.min(1, MAX_POSTER_EDGE / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const context = canvas.getContext('2d');
      if (!context) throw problem('unreadable');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const poster = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      assertLive();
      if (!poster?.size || poster.size > MAX_POSTER_BYTES) throw problem('unreadable');
      return { poster, w, h, duration };
    })();
    return await Promise.race([work, stopped]);
  } catch (error) {
    if (error.name === 'AbortError' || ['unsupported', 'timeout', 'blocked', 'unreadable', 'too-large'].includes(error.code)) throw error;
    throw problem('unreadable');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.abort(aborted());
    video.removeEventListener('error', onError);
    if (frameId !== undefined) video.cancelVideoFrameCallback(frameId);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}
