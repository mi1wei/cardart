import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';

export async function acquireLibraryLock(dir, { onCompromised } = {}) {
  const root = await realpath(dir);
  let lost = false;
  try {
    const unlock = await lockfile.lock(root, {
      realpath: false,
      lockfilePath: join(root, '.folio.lock'),
      retries: 0,
      update: 30000,
      stale: 120000,
      onCompromised(cause) {
        lost = true;
        onCompromised?.(Object.assign(new Error('library-lock-lost'), { code: 'LIBRARY_LOCK_LOST', status: 503, cause }));
      },
    });
    let closing;
    return () => closing ??= lost ? Promise.resolve() : unlock();
  } catch (error) {
    if (error.code === 'ELOCKED') throw Object.assign(new Error('library-in-use'), { code: 'LIBRARY_IN_USE', status: 409 });
    throw error;
  }
}
