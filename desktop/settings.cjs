const { constants } = require('node:fs');
const { mkdir, readFile, writeFile, rename, copyFile, rm, stat, realpath } = require('node:fs/promises');
const { dirname, join, resolve, isAbsolute } = require('node:path');
const { randomUUID } = require('node:crypto');

function validate(value) {
  if (!value || value.version !== 1 ||
    (value.libraryDir !== undefined && (typeof value.libraryDir !== 'string' || !isAbsolute(value.libraryDir))) ||
    (value.preferredPort !== undefined && (!Number.isInteger(value.preferredPort) || value.preferredPort < 1 || value.preferredPort > 65535))) {
    throw Object.assign(new Error('Invalid desktop settings'), { code: 'SETTINGS_CORRUPT' });
  }
  return value;
}

async function loadSettings(file) {
  try { return validate(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return { version: 1 };
    if (error instanceof SyntaxError) throw Object.assign(new Error('Desktop settings are unreadable'), { code: 'SETTINGS_CORRUPT', cause: error });
    throw error;
  }
}

async function saveSettings(file, value) {
  validate(value);
  await mkdir(dirname(file), { recursive: true });
  try { await loadSettings(file); }
  catch (error) {
    if (error.code !== 'SETTINGS_CORRUPT') throw error;
    await copyFile(file, `${file}.corrupt-${randomUUID()}`, constants.COPYFILE_EXCL);
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}

async function statOrMissing(path) {
  try { return await stat(path); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function resolveLibraryChoice({ envDir, storedDir, picturesDir, legacyDir }) {
  if (envDir) return { path: resolve(envDir), conflicts: [] };
  if (storedDir) {
    if (!(await statOrMissing(storedDir))?.isDirectory()) {
      throw Object.assign(new Error('The saved library has moved or is unavailable'), { code: 'LIBRARY_MISSING', path: storedDir });
    }
    return { path: await realpath(storedDir), conflicts: [] };
  }
  const native = join(picturesDir, '相册库');
  const existing = [];
  for (const candidate of [legacyDir, native].filter(Boolean)) {
    if (!(await statOrMissing(join(candidate, 'library.json')))?.isFile()) continue;
    const path = await realpath(candidate);
    if (!existing.includes(path)) existing.push(path);
  }
  return existing.length > 1
    ? { path: null, conflicts: existing }
    : { path: existing[0] ?? native, conflicts: [] };
}

module.exports = { loadSettings, saveSettings, resolveLibraryChoice };
