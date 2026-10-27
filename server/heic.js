import { Worker } from 'node:worker_threads';
import { MAX_BYTES, MAX_HEIC_PIXELS } from './image-limits.js';

let tail = Promise.resolve();
const aborted = () => new DOMException('HEIC decoding was cancelled', 'AbortError');

function runWorker(file, signal) {
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./heic-worker.cjs', import.meta.url), {
      workerData: { file, maxBytes: MAX_BYTES, maxPixels: MAX_HEIC_PIXELS },
      stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      void worker.terminate().then(() => error ? reject(error) : resolve(result), reject);
    };
    const cancel = () => finish(aborted());
    const timer = setTimeout(() => finish(Object.assign(new Error('HEIC decoding timed out'), { code: 'HEIC_TIMEOUT' })), 60000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.once('message', (message) => {
      if (message.error) return finish(Object.assign(new Error(message.error.message), { code: message.error.code }));
      const { width, height, pixels } = message;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_HEIC_PIXELS || !(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) {
        return finish(Object.assign(new Error('Invalid HEIC decoder output'), { code: 'HEIC_DECODE_FAILED' }));
      }
      finish(null, { width, height, pixels });
    });
    worker.once('error', () => finish(Object.assign(new Error('The HEIC worker failed'), { code: 'HEIC_DECODE_FAILED' })));
    worker.once('exit', () => { if (!done) finish(Object.assign(new Error('The HEIC worker exited early'), { code: 'HEIC_DECODE_FAILED' })); });
  });
}

export function decodeHeic(file, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(aborted());
  const task = tail.then(() => runWorker(file, signal));
  tail = task.catch(() => {});
  if (!signal) return task;
  let cancel;
  const cancellation = new Promise((resolve, reject) => {
    cancel = () => reject(aborted());
    signal.addEventListener('abort', cancel, { once: true });
  });
  return Promise.race([task, cancellation]).finally(() => signal.removeEventListener('abort', cancel));
}
