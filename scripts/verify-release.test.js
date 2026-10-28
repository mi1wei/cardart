import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { verifyWindowsExecutableMetadata, verifyWindowsUpdate } from './verify-release.mjs';

const version = '0.1.0-beta.1';
const name = `Folio-${version}-windows-x64-setup.exe`;
const payload = Buffer.from('Owned Windows installer fixture');
const sha512 = createHash('sha512').update(payload).digest('base64');
const block = { version: '2', files: [{ name: 'file', offset: 0, sizes: [31], checksums: ['PirorfDIuLeX5B+zPJHrsGtY'] }] };
const metadata = {
  version, files: [{ url: name, sha512, size: 31, isAdminRightsRequired: true }],
  path: name, sha512,
};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'folio-update-metadata-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const installer = join(dir, name);
  const update = join(dir, 'beta.yml');
  const blockmap = `${installer}.blockmap`;
  await writeFile(installer, payload);
  await writeFile(update, JSON.stringify(metadata));
  await writeFile(blockmap, gzipSync(JSON.stringify(block)));
  return { installer, update, blockmap, version };
}

test('Windows native metadata accepts the builder numeric app version and the NSIS prerelease version', () => {
  const state = { status: 'NotSigned', productName: 'Folio', productVersion: '0.1.0.0', fileVersion: version };
  assert.doesNotThrow(() => verifyWindowsExecutableMetadata(state, {
    file: 'Folio.exe', version, productVersion: '0.1.0.0',
  }));
  assert.doesNotThrow(() => verifyWindowsExecutableMetadata({ ...state, productVersion: version }, {
    file: name, version,
  }));
});

test('Windows native metadata still rejects stale beta identity, foreign products and any residual signature', () => {
  const state = { status: 'NotSigned', productName: 'Folio', productVersion: version, fileVersion: version };
  for (const changed of [
    { fileVersion: '0.1.0-beta.0' }, { fileVersion: undefined },
    { productVersion: '0.1.0-beta.0' }, { productName: 'Electron' },
    { status: 'Valid' }, { status: 'HashMismatch' }, { status: 'NotTrusted' },
  ]) {
    assert.throws(() => verifyWindowsExecutableMetadata({ ...state, ...changed }, {
      file: name, version,
    }), /trust\/product metadata/i);
  }
});

test('Windows beta metadata and every block checksum match the actual full installer bytes', async (t) => {
  const f = await fixture(t);
  await verifyWindowsUpdate(f);
  await writeFile(f.installer, Buffer.from('Owned Windows installer fixturE'));
  await assert.rejects(verifyWindowsUpdate(f), /hash|SHA-512/i);
});

test('Windows beta metadata rejects old versions, other URLs, wrong size and missing per-machine elevation', async (t) => {
  const f = await fixture(t);
  for (const [value, reason] of [
    [{ ...metadata, version: '0.1.0-beta.0' }, /version/i],
    [{ ...metadata, files: [{ ...metadata.files[0], url: 'https://example.test/other.exe' }] }, /filename|URL/i],
    [{ ...metadata, files: [{ ...metadata.files[0], size: 30 }] }, /size/i],
    [{ ...metadata, files: [{ ...metadata.files[0], isAdminRightsRequired: false }] }, /elevation/i],
  ]) {
    await writeFile(f.update, JSON.stringify(value));
    await assert.rejects(verifyWindowsUpdate(f), reason);
  }
});

test('a blockmap with the right filename but wrong ranges or chunk digests is rejected', async (t) => {
  const f = await fixture(t);
  await writeFile(f.blockmap, gzipSync(JSON.stringify({ ...block, files: [{ ...block.files[0], checksums: ['AAAAAAAAAAAAAAAAAAAAAAAA'] }] })));
  await assert.rejects(verifyWindowsUpdate(f), /block.*checksum/i);
  await writeFile(f.blockmap, gzipSync(JSON.stringify({ ...block, files: [{ ...block.files[0], sizes: [30] }] })));
  await assert.rejects(verifyWindowsUpdate(f), /block.*size|coverage/i);
});
