import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { acquireLibraryLock } from './library-lock.js';

export const DEFAULT_DIR = join(homedir(), 'Pictures', '相册库');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isAlbumId = (id) => typeof id === 'string' && UUID.test(id);
export const isPhotoId = (id) => typeof id === 'string' && /^p\d{3,}$/.test(id);
// `code` is a key of server/text.js; app.js turns it into the visitor's language.
export const fail = (status, code) => Object.assign(new Error(code), { status });

const newKey = () => randomBytes(16).toString('hex');

// Write a temp file, then rename it: a crash never leaves half a JSON file behind.
async function writeJson(file, data) {
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2));
  await rename(`${file}.tmp`, file);
}

function cleanTitle(title) {
  const t = typeof title === 'string' ? title.trim() : '';
  if (!t || [...t].length > 50) throw fail(400, 'title-length');
  return t;
}

export async function openLibrary(dir) {
  await mkdir(dir, { recursive: true });
  let lost;
  const release = await acquireLibraryLock(dir, { onCompromised(error) { lost = error; } });
  try {
    return await loadLibrary(dir, release, () => { if (lost) throw lost; });
  } catch (error) {
    await release();
    throw error;
  }
}

async function loadLibrary(dir, release, assertLock) {
  const albumsDir = join(dir, 'albums');
  await mkdir(albumsDir, { recursive: true });

  const settingsFile = join(dir, 'library.json');
  let settings;
  try {
    settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw Object.assign(new Error('library-corrupt'), { code: 'LIBRARY_CORRUPT', cause: err });
    settings = { version: 1, phone: { enabled: false, key: newKey() } };
    await writeJson(settingsFile, settings);
  }

  const albums = new Map();
  for (const id of await readdir(albumsDir)) {
    if (id.startsWith('.del-')) await rm(join(albumsDir, id), { recursive: true, force: true }); // a delete cut short
    if (!isAlbumId(id)) continue;
    try {
      albums.set(id, JSON.parse(await readFile(join(albumsDir, id, 'album.json'), 'utf8')));
    } catch (err) {
      console.warn(`跳过相册 ${id}：${err.message}\nSkipped album ${id}: ${err.message}`);
      continue;
    }
    for (const sub of ['originals', 'cache']) {
      const folder = join(albumsDir, id, sub);
      for (const name of await readdir(folder).catch(() => [])) {
        if (name.startsWith('.tmp-')) await rm(join(folder, name), { force: true });
      }
    }
  }

  // Tasks for one album run one after another; a failed task does not block the next.
  const queues = new Map();
  let closing;
  let closed = false;
  function queue(id, task) {
    if (closing) return Promise.reject(Object.assign(fail(503, 'library-closed'), { code: 'LIBRARY_CLOSED' }));
    const run = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(() => { assertLock(); return task(); });
    queues.set(id, run);
    return run;
  }

  const albumDir = (id) => join(albumsDir, id);
  function get(id) {
    assertLock();
    const album = isAlbumId(id) ? albums.get(id) : null;
    if (!album) throw fail(404, 'album-missing');
    return album;
  }
  // Albums are replaced, never mutated, so a reader always sees a whole snapshot.
  async function save(album) {
    if (closed) throw Object.assign(fail(503, 'library-closed'), { code: 'LIBRARY_CLOSED' });
    assertLock();
    await writeJson(join(albumDir(album.id), 'album.json'), album);
    albums.set(album.id, album);
    return album;
  }

  return {
    dir,
    albumDir,
    get,
    save,
    queue,
    close() {
      closing ??= Promise.allSettled([...queues.values()]).then(async () => { closed = true; await release(); });
      return closing;
    },
    list() {
      return [...albums.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => {
          // The pocket on the wall shows the cover in front, then the next photos (spec §7, §11).
          const cover = a.photos.find((p) => p.id === a.cover) ?? a.photos[0];
          const previews = cover ? [cover, ...a.photos.slice(0, 3).filter((p) => p !== cover)].slice(0, 3) : [];
          return {
            id: a.id,
            title: a.title,
            count: a.photos.length,
            previews: previews.map(({ id, w, h }) => ({ id, w, h })),
            createdAt: a.createdAt,
          };
        });
    },
    create(title) {
      return queue('__create__', async () => {
        const album = {
          version: 1,
          id: randomUUID(),
          title: cleanTitle(title),
          createdAt: new Date().toISOString(),
          cover: null,
          perPage: 2,
          nextSeq: 1,
          photos: [],
        };
        await mkdir(join(albumDir(album.id), 'originals'), { recursive: true });
        await mkdir(join(albumDir(album.id), 'cache'), { recursive: true });
        return save(album);
      });
    },
    async update(id, patch) {
      get(id);
      if (!patch || typeof patch !== 'object') throw fail(400, 'bad-request');
      return queue(id, () => {
        const album = get(id);
        const next = { ...album };
        if ('title' in patch) next.title = cleanTitle(patch.title);
        if ('cover' in patch) {
          if (patch.cover !== null && !album.photos.some((p) => p.id === patch.cover)) throw fail(400, 'cover-missing');
          next.cover = patch.cover;
        }
        if ('perPage' in patch) {
          if (![1, 2, 3].includes(patch.perPage)) throw fail(400, 'per-page');
          next.perPage = patch.perPage;
        }
        if ('order' in patch) {
          const byId = new Map(album.photos.map((p) => [p.id, p]));
          const order = patch.order;
          const same =
            Array.isArray(order) &&
            order.length === byId.size &&
            new Set(order).size === order.length &&
            order.every((pid) => byId.has(pid));
          if (!same) throw fail(409, 'order-changed');
          next.photos = order.map((pid) => byId.get(pid));
        }
        return save(next);
      });
    },
    async remove(id) {
      get(id);
      return queue(id, async () => {
        get(id);
        // Rename first, so the album is gone at once; a crash mid-delete only leaves a .del- folder.
        const doomed = join(albumsDir, `.del-${id}`);
        await rename(albumDir(id), doomed);
        albums.delete(id);
        await rm(doomed, { recursive: true, force: true });
      });
    },
    async deletePhotos(id, ids) {
      get(id);
      if (!Array.isArray(ids) || !ids.length) throw fail(400, 'none-selected');
      return queue(id, async () => {
        const album = get(id);
        const drop = new Set(ids);
        const gone = album.photos.filter((p) => drop.has(p.id));
        if (!gone.length) return album;
        // album.json first: a crash afterwards only leaves files nobody points to.
        const next = await save({
          ...album,
          cover: drop.has(album.cover) ? null : album.cover,
          photos: album.photos.filter((p) => !drop.has(p.id)),
        });
        for (const p of gone) {
          await rm(join(albumDir(id), 'originals', p.file), { force: true });
          for (const size of [600, 1600]) await rm(join(albumDir(id), 'cache', `${p.id}_${size}.webp`), { force: true });
        }
        return next;
      });
    },
    phone: () => settings.phone,
    setPhone(enabled) {
      return queue('__settings__', async () => {
        settings = { ...settings, phone: { enabled: !!enabled, key: enabled ? newKey() : settings.phone.key } };
        await writeJson(settingsFile, settings);
        return settings.phone;
      });
    },
  };
}
