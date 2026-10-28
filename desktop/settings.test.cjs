const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, readFile, rm, realpath } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { loadSettings, saveSettings, resolveLibraryChoice } = require('./settings.cjs');

async function workspace(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'folio-settings-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('settings preserve unicode paths and reject corruption without overwriting it', async (t) => {
  const root = await workspace(t);
  const file = join(root, 'desktop.json');
  assert.deepEqual(await loadSettings(file), { version: 1 });
  const settings = { version: 1, libraryDir: join(root, '照片 album'), preferredPort: 5291 };
  await saveSettings(file, settings);
  assert.deepEqual(await loadSettings(file), settings);
  await writeFile(file, '{broken');
  await assert.rejects(loadSettings(file), { code: 'SETTINGS_CORRUPT' });
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('existing legacy library is reused but two different libraries require selection', async (t) => {
  const root = await workspace(t);
  const legacyDir = join(root, 'legacy');
  const picturesDir = join(root, 'Pictures');
  await mkdir(legacyDir);
  await writeFile(join(legacyDir, 'library.json'), '{}');
  assert.equal((await resolveLibraryChoice({ legacyDir, picturesDir })).path, legacyDir);
  const native = join(picturesDir, '相册库');
  await mkdir(native, { recursive: true });
  await writeFile(join(native, 'library.json'), '{}');
  const choice = await resolveLibraryChoice({ legacyDir, picturesDir });
  assert.equal(choice.path, null);
  assert.deepEqual(new Set(choice.conflicts), new Set([legacyDir, native]));
  assert.equal((await resolveLibraryChoice({ envDir: legacyDir, storedDir: native, picturesDir })).path, legacyDir);
});

test('a missing saved library is reported rather than silently replaced by an empty one', async (t) => {
  const root = await workspace(t);
  await assert.rejects(
    resolveLibraryChoice({ storedDir: join(root, 'moved'), picturesDir: join(root, 'Pictures') }),
    { code: 'LIBRARY_MISSING' },
  );
});

test('discovery does not hide filesystem errors by choosing an empty library', async (t) => {
  const root = await workspace(t);
  const legacyDir = join(root, 'not-a-directory');
  await writeFile(legacyDir, 'blocked');
  await assert.rejects(resolveLibraryChoice({ legacyDir, picturesDir: join(root, 'Pictures') }), { code: 'ENOTDIR' });
  await assert.rejects(resolveLibraryChoice({ legacyDir: join(legacyDir, 'child'), picturesDir: join(root, 'Pictures') }), { code: 'ENOTDIR' });
});
