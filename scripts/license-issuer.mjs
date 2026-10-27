import { generateKeyPairSync, createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, realpath, rm, lstat } from 'node:fs/promises';
import { dirname, basename, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { verifyLicense, parseLicenseExpiry } from '../server/license.js';

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function privateLocation(file) {
  if (!file || !isAbsolute(file)) throw new Error('The private key path must be absolute and outside a repository');
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const resolved = await exists(file) ? await realpath(file) : join(await realpath(dirname(file)), basename(file));
  const parent = dirname(resolved);
  for (let folder = parent; ; folder = dirname(folder)) {
    if (await exists(join(folder, '.git'))) throw new Error('Private keys must remain outside any repository');
    if (dirname(folder) === folder) break;
  }
  return resolved;
}

function checkWindowsACL(file) {
  if (process.platform !== 'win32') return;
  const script = fileURLToPath(new URL('./check-license-key-acl.ps1', import.meta.url));
  const result = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-Path', file], { encoding: 'utf8' }));
  if (!result.safe) throw new Error('The key directory/file ACL permits other users. Restrict its ACL before signing.');
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(['private-out', 'public-out', 'private-key', 'plan', 'expires-at', 'out'].map((name) => [name, { type: 'string' }])),
  });
  if (positionals.length !== 1) throw new Error('Use keygen or issue with explicit output paths');
  if (positionals[0] === 'keygen') {
    const privateFile = await privateLocation(values['private-out']);
    if (!values['public-out']) throw new Error('--public-out is required');
    const publicFile = resolve(values['public-out']);
    if (await exists(privateFile) || await exists(publicFile)) throw new Error('Refusing to overwrite an existing key');
    checkWindowsACL(dirname(privateFile));
    await mkdir(dirname(publicFile), { recursive: true });
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    await writeFile(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
    try {
      checkWindowsACL(privateFile);
      await writeFile(publicFile, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
    } catch (error) {
      await rm(privateFile);
      throw error;
    }
    console.log('Key pair created. Keep the private key offline; distribute only the public key.');
  } else if (positionals[0] === 'issue') {
    const privateFile = await privateLocation(values['private-key']);
    const metadata = await stat(privateFile);
    if (process.platform !== 'win32' && (metadata.mode & 0o077)) throw new Error('Private key permissions must be 0600');
    checkWindowsACL(privateFile);
    if (!['trial', 'pro'].includes(values.plan) || !values.out) throw new Error('--plan trial|pro and --out are required');
    const expiry = parseLicenseExpiry(values['expires-at']);
    if (expiry === null || expiry <= Date.now()) throw new Error('--expires-at must be a future, valid UTC timestamp');
    const key = createPrivateKey(await readFile(privateFile));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 private key is required');
    const bytes = Buffer.from(JSON.stringify({
      license_id: `lic_${randomUUID()}`, plan: values.plan, device_id: null,
      expires_at: values['expires-at'], features: ['album_write'], license_version: 1,
    }));
    const envelope = { payload: bytes.toString('base64url'), signature: sign(null, bytes, key).toString('base64url') };
    if (!verifyLicense(envelope, createPublicKey(key)).canWrite) throw new Error('The issued license did not verify');
    const output = resolve(values.out);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(envelope, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('License file written. Deliver it privately to the tester.');
  } else throw new Error('Unknown command; use keygen or issue');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
