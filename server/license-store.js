import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseLicensePublicKey, verifyLicense, MAX_LICENSE_BYTES } from './license.js';

export async function createLicenseStore({ file, publicKey, onChange }) {
  const key = parseLicensePublicKey(publicKey);
  let envelope = null;
  let corrupt = false;
  let writes = Promise.resolve();
  try {
    if ((await stat(file)).size > MAX_LICENSE_BYTES) corrupt = true;
    else envelope = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) corrupt = true;
    else if (error.code !== 'ENOENT') throw error;
  }
  const status = () => corrupt ? { state: 'invalid', canWrite: false } : verifyLicense(envelope, key);
  const notify = () => { try { onChange?.(status()); } catch {} };
  const check = (candidate) => {
    const state = verifyLicense(candidate, key);
    if (state.state !== 'active') {
      const code = state.reason === 'unsupported-binding' ? 'LICENSE_BINDING_UNSUPPORTED' : state.state === 'expired' ? 'LICENSE_EXPIRED' : 'LICENSE_INVALID';
      throw Object.assign(new Error(code.toLowerCase().replaceAll('_', '-')), { code, status: 400 });
    }
    return state;
  };
  notify();
  return {
    status,
    async activate(candidate) {
      check(candidate);
      const snapshot = { payload: candidate.payload, signature: candidate.signature };
      const job = writes.catch(() => {}).then(async () => {
        check(snapshot);
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        const temp = `${file}.${randomUUID()}.tmp`;
        try {
          await writeFile(temp, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
          await rename(temp, file);
        } finally { await rm(temp, { force: true }); }
        envelope = snapshot;
        corrupt = false;
        notify();
        return status();
      });
      writes = job.catch(() => {});
      return job;
    },
  };
}
