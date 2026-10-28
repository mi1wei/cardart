import { createPublicKey, KeyObject, verify } from 'node:crypto';

export const MAX_LICENSE_BYTES = 8192;
const invalid = (reason) => ({ state: 'invalid', canWrite: false, ...(reason ? { reason } : {}) });
const keysAre = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));

export function parseLicensePublicKey(value) {
  try {
    let key;
    if (value instanceof KeyObject) key = value;
    else {
      const pem = String(value);
      if (!pem.startsWith('-----BEGIN PUBLIC KEY-----') || pem.includes('PRIVATE KEY')) throw new Error();
      key = createPublicKey(pem);
    }
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw Object.assign(new Error('license-public-key-invalid'), { code: 'LICENSE_PUBLIC_KEY_INVALID' });
  }
}

export function parseLicenseExpiry(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().replace('.000Z', 'Z') === value ? time : null;
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw new Error();
  return bytes;
}

export function verifyLicense(envelope, publicKey, nowMs = Date.now()) {
  if (envelope === null) return { state: 'missing', canWrite: false };
  try {
    if (!Number.isFinite(nowMs) || !keysAre(envelope, ['payload', 'signature']) ||
      Buffer.byteLength(JSON.stringify(envelope)) > MAX_LICENSE_BYTES) return invalid();
    const bytes = decodeBase64(envelope.payload);
    const signature = decodeBase64(envelope.signature);
    if (signature.length !== 64 || !verify(null, bytes, parseLicensePublicKey(publicKey), signature)) return invalid();
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!keysAre(value, ['license_id', 'plan', 'device_id', 'expires_at', 'features', 'license_version']) ||
      typeof value.license_id !== 'string' || value.license_id.length < 1 || value.license_id.length > 128 ||
      /[^A-Za-z0-9._-]/.test(value.license_id) || value.license_version !== 1 ||
      !['trial', 'pro'].includes(value.plan) || !Array.isArray(value.features) ||
      new Set(value.features).size !== value.features.length ||
      value.features.some((feature) => feature !== 'album_write')) return invalid();
    const expiry = parseLicenseExpiry(value.expires_at);
    if (expiry === null) return invalid();
    if (value.device_id !== null) return invalid('unsupported-binding');
    const expired = nowMs >= expiry;
    return {
      state: expired ? 'expired' : 'active',
      plan: value.plan, expiresAt: value.expires_at,
      canWrite: !expired && value.features.includes('album_write'),
    };
  } catch { return invalid(); }
}
