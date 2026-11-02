import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { acquireLibraryLock } from './library-lock.js';
import { mediaCounts } from '../shared/media.js';
import { readPhotoMetadata } from './photo-metadata.js';
import { exists, transactions, writeJson } from './library-transactions.js';

export const DEFAULT_DIR = join(homedir(), 'Pictures', '相册库');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isAlbumId = (id) => typeof id === 'string' && UUID.test(id);
export const isPhotoId = (id) => typeof id === 'string' && /^p\d{3,}$/.test(id);
// `code` is a key of server/text.js; app.js turns it into the visitor's language.
export const fail = (status, code) => Object.assign(new Error(code), { status });

const newKey = () => randomBytes(16).toString('hex');

const now = () => new Date().toISOString();
const touched = (album) => ({ ...album, updatedAt: now(), sort: album.sort ?? 'manual' });
const taken = (photo) => {
  const value = photo.metadata?.takenAt?.local;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value)) return null;
  const date = new Date(`${value}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value ? value : null;
};
const addedTime = (photo) => typeof photo.addedAt === 'string' && Number.isFinite(Date.parse(photo.addedAt)) ? photo.addedAt : null;
const added = (a, b) => {
  const x = addedTime(a), y = addedTime(b);
  return x && y ? x.localeCompare(y) : x ? 1 : y ? -1 : 0;
};
function snapshot(album) {
  const photos = [...album.photos];
  if (album.sort === 'added') photos.sort(added);
  if (album.sort === 'taken') photos.sort((a, b) => {
    const x = taken(a), y = taken(b);
    return x && y ? x.localeCompare(y) || added(a, b) : x ? -1 : y ? 1 : added(a, b);
  });
  const dates = photos.map(taken).filter(Boolean).sort();
  return { ...album, updatedAt: album.updatedAt ?? album.createdAt, sort: album.sort ?? 'manual', photos,
    dateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : null };
}
function selected(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !isPhotoId(id)) || new Set(ids).size !== ids.length) throw fail(400, 'none-selected');
  return new Set(ids);
}
function entryIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !isAlbumId(id)) || new Set(ids).size !== ids.length) throw fail(400, 'none-selected');
  return ids;
}
function asset(name) {
  if (typeof name !== 'string' || name !== basename(name) || /[\\/\x00-\x1f]/.test(name) || name === '.' || name === '..') throw new Error('Invalid stored media filename');
  return name;
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
  const trashRoot = join(dir, '.trash');
  await mkdir(trashRoot, { recursive: true });
  const transaction = await transactions(dir);

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
      const album = JSON.parse(await readFile(join(albumsDir, id, 'album.json'), 'utf8'));
      albums.set(id, { ...album, sort: album.sort ?? 'manual', updatedAt: album.updatedAt ?? album.createdAt });
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

  const trash = new Map();
  for (const id of await readdir(trashRoot)) {
    if (!isAlbumId(id)) throw new Error(`Invalid trash entry: ${id}`);
    let entry;
    try { entry = JSON.parse(await readFile(join(trashRoot, id, 'entry.json'), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT' && !(await readdir(join(trashRoot, id))).length) {
        await rm(join(trashRoot, id), { recursive: true });
        continue;
      }
      throw Object.assign(new Error(`Unreadable trash entry ${id}; contents preserved for recovery`), { code: 'TRASH_CORRUPT', cause: error });
    }
    if (entry.id !== id || !['photos', 'album'].includes(entry.kind) || !isAlbumId(entry.albumId) ||
      !Array.isArray(entry.photos) || !Number.isFinite(Date.parse(entry.deletedAt))) throw new Error(`Invalid trash entry: ${id}`);
    trash.set(id, entry);
  }

  // All library mutations share a coordinator; a failed task does not block the next.
  let tail = Promise.resolve();
  let metadataJob;
  let closing;
  let closed = false;
  function queue(id, task) {
    if (closing) return Promise.reject(Object.assign(fail(503, 'library-closed'), { code: 'LIBRARY_CLOSED' }));
    // One coordinator also covers transfers, restores and imports. Never nest queue().
    const run = tail.catch(() => {}).then(() => { assertLock(); transaction.assertHealthy(); return task(); });
    tail = run;
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
    transaction.assertHealthy();
    const next = touched(album);
    await writeJson(join(albumDir(album.id), 'album.json'), next);
    albums.set(album.id, next);
    return next;
  }
  const trashDir = (id) => join(trashRoot, id);
  async function identities(album, photos, preserve = false, base = albumDir(album.id)) {
    const folders = base === null ? [] : await Promise.all(['originals', 'cache'].map((sub) => readdir(join(base, sub))));
    const used = new Set(album.photos.map((item) => item.id));
    for (const name of folders.flat()) {
      const match = /^(p\d{3,})[._-]/.exec(name);
      if (match) used.add(match[1]);
    }
    let sequence = album.nextSeq ?? 1;
    const mapped = photos.map((photo) => {
      let id = preserve && !used.has(photo.id) ? photo.id : null;
      if (!id) {
        while (used.has(`p${String(sequence).padStart(3, '0')}`)) sequence++;
        id = `p${String(sequence++).padStart(3, '0')}`;
      }
      used.add(id);
      sequence = Math.max(sequence, Number(id.slice(1)) + 1);
      if (id === photo.id) return { ...photo };
      return { ...photo, id, file: `${id}${extname(asset(photo.file))}`,
        ...(photo.poster && { poster: `${id}-poster${extname(asset(photo.poster))}` }) };
    });
    return { photos: mapped, nextSeq: sequence };
  }
  async function files(base, photo) {
    const result = [['originals', asset(photo.file)]];
    if (photo.poster) result.push(['originals', asset(photo.poster)]);
    for (const size of [600, 1600]) {
      const name = `${photo.id}_${size}.webp`;
      if (await exists(join(base, 'cache', name))) result.push(['cache', name]);
    }
    return result;
  }
  async function copyOperations(sourceDir, destinationDir, originals, copies) {
    const operations = [];
    for (let i = 0; i < originals.length; i++) {
      const photo = originals[i], copy = copies[i];
      for (const [sub, name] of await files(sourceDir, photo)) {
        const renamed = sub === 'cache' ? name.replace(photo.id, copy.id) : name === photo.file ? copy.file : copy.poster;
        const to = join(destinationDir, sub, renamed);
        if (await exists(to)) throw new Error(`Media destination collision: ${to}`);
        operations.push({ type: 'copy', from: join(sourceDir, sub, name), to });
      }
    }
    return operations;
  }
  async function purge(ids) {
    const entries = ids.map((id) => trash.get(id)).filter(Boolean);
    await transaction.run({ cleanup: entries.map((entry) => trashDir(entry.id)) }, () => {
      for (const entry of entries) trash.delete(entry.id);
    });
    return { purged: entries.map((entry) => entry.id) };
  }
  async function expire() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ids = [...trash.values()].filter((entry) => Date.parse(entry.deletedAt) <= cutoff).map((entry) => entry.id);
    if (ids.length) await purge(ids);
  }
  await expire();
  const expiry = setInterval(() => { queue('__expiry__', expire).catch((error) => console.error('Trash expiry failed', error)); }, 6 * 60 * 60 * 1000);
  expiry.unref();
  const library = {
    dir,
    albumDir,
    get,
    save,
    queue,
    snapshot: (id) => snapshot(get(id)),
    trashDir,
    listTrash: () => [...trash.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    getTrash(id) {
      const entry = isAlbumId(id) && trash.get(id);
      if (!entry) throw fail(404, 'trash-missing');
      return entry;
    },
    async nextPhotoIdentity(album) {
      const current = get(album.id);
      const folders = await Promise.all(['originals', 'cache'].map((sub) => readdir(join(albumDir(album.id), sub))));
      const used = new Set(current.photos.map((item) => item.id));
      for (const name of folders.flat()) {
        const match = /^(p\d{3,})[._-]/.exec(name);
        if (match) used.add(match[1]);
      }
      let sequence = current.nextSeq;
      while (used.has(`p${String(sequence).padStart(3, '0')}`)) sequence++;
      return { id: `p${String(sequence).padStart(3, '0')}`, sequence };
    },
    close() {
      if (!closing) {
        clearInterval(expiry);
        closing = (async () => {
          await metadataJob;
          await tail.catch(() => {});
          closed = true;
          await release();
        })();
      }
      return closing;
    },
    list() {
      return [...albums.values()]
        .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
        .map((raw) => {
          const a = snapshot(raw);
          // The pocket on the wall shows the cover in front, then the next photos (spec §7, §11).
          const cover = a.photos.find((p) => p.id === a.cover) ?? a.photos[0];
          const previews = cover ? [cover, ...a.photos.slice(0, 3).filter((p) => p !== cover)].slice(0, 3) : [];
          return {
            id: a.id,
            title: a.title,
            ...mediaCounts(a.photos),
            previews: previews.map(({ id, w, h }) => ({ id, w, h })),
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            dateRange: a.dateRange,
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
          sort: 'manual',
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
        if ('sort' in patch) {
          if (!['manual', 'taken', 'added'].includes(patch.sort)) throw fail(400, 'sort-invalid');
          next.sort = patch.sort;
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
    async updatePhotoNote(id, photoId, patch) {
      get(id);
      if (!isPhotoId(photoId)) throw fail(404, 'no-photo');
      if (!patch || Array.isArray(patch) || typeof patch.note !== 'string' || typeof patch.previousNote !== 'string') throw fail(400, 'bad-request');
      const note = patch.note.replace(/\r\n?/g, '\n').trim();
      if ([...note].length > 2000 || [...patch.previousNote].length > 2000) throw fail(400, 'note-length');
      return queue(id, () => {
        const album = get(id);
        const photo = album.photos.find((item) => item.id === photoId);
        if (!photo) throw fail(404, 'no-photo');
        const current = typeof photo.note === 'string' ? photo.note : '';
        if (current !== patch.previousNote && current !== note) throw fail(409, 'note-changed');
        if (current === note) return album;
        return save({ ...album, photos: album.photos.map((item) => item.id === photoId ? { ...item, note } : item) });
      });
    },
    async remove(id) {
      get(id);
      return queue(id, async () => {
        const album = get(id);
        const entry = { id: randomUUID(), kind: 'album', albumId: id, albumTitle: album.title,
          deletedAt: now(), photos: album.photos, album };
        await transaction.run({ before: [album], entries: [entry],
          operations: [{ type: 'move', from: albumDir(id), to: join(trashDir(entry.id), 'album') }] }, () => {
          albums.delete(id);
          trash.set(entry.id, entry);
        });
        return entry.id;
      });
    },
    async deletePhotos(id, ids) {
      get(id);
      const drop = selected(ids);
      return queue(id, async () => {
        const album = get(id);
        const gone = album.photos.filter((p) => drop.has(p.id));
        if (!gone.length) throw fail(404, 'no-photo');
        const next = touched({
          ...album,
          cover: drop.has(album.cover) ? null : album.cover,
          photos: album.photos.filter((p) => !drop.has(p.id)),
        });
        const entry = { id: randomUUID(), kind: 'photos', albumId: id, albumTitle: album.title, deletedAt: now(), photos: gone };
        const operations = [];
        for (const photo of gone) for (const [sub, name] of await files(albumDir(id), photo)) {
          operations.push({ type: 'move', from: join(albumDir(id), sub, name), to: join(trashDir(entry.id), sub, name) });
        }
        await transaction.run({ before: [album], after: [next], entries: [entry], operations }, () => {
          albums.set(id, next); trash.set(entry.id, entry);
        });
        return { ...next, trashId: entry.id };
      });
    },
    async purgeTrash(options) {
      if (!options || (options.all !== true && !Array.isArray(options.ids))) throw fail(400, 'bad-request');
      const ids = options.all === true ? null : entryIds(options.ids);
      return queue('__trash__', () => purge(ids ?? [...trash.keys()]));
    },
    async restoreTrash(ids) {
      entryIds(ids);
      return queue('__trash__', async () => {
        const restored = [];
        // Plan the entire request as one transaction, including implicit album restoration.
        const before = new Map(), after = new Map(), entries = new Map(), operations = [], createdAlbums = [];
        const current = (id) => after.get(id) ?? albums.get(id);
        async function restoreAlbum(entry) {
          if (current(entry.albumId)) throw fail(409, 'restore-collision');
          const album = touched(entry.album);
          after.set(album.id, album);
          operations.push({ type: 'move', from: join(trashDir(entry.id), 'album'), to: albumDir(album.id) });
          entries.set(entry.id, entry);
          restored.push(entry.id);
          return album;
        }
        for (const id of ids) {
          if (entries.has(id)) continue;
          const entry = trash.get(id);
          if (!entry) throw fail(404, 'trash-missing');
          if (entry.kind === 'album') { await restoreAlbum(entry); continue; }
          let album = current(entry.albumId);
          let base = albumDir(entry.albumId);
          if (!album) {
            const deletedAlbum = [...trash.values()].find((item) => item.kind === 'album' && item.albumId === entry.albumId);
            if (deletedAlbum) {
              album = await restoreAlbum(deletedAlbum);
              base = join(trashDir(deletedAlbum.id), 'album');
            } else {
              if (await exists(base)) throw fail(409, 'restore-collision');
              album = { version: 1, id: entry.albumId, title: entry.albumTitle, createdAt: now(), sort: 'manual', cover: null, perPage: 2, nextSeq: 1, photos: [] };
              createdAlbums.push(album.id);
            }
          } else {
            const pendingAlbum = [...entries.values()].find((item) => item.kind === 'album' && item.albumId === album.id);
            if (pendingAlbum) base = join(trashDir(pendingAlbum.id), 'album');
            else if (!before.has(album.id) && albums.has(album.id)) before.set(album.id, albums.get(album.id));
          }
          const mapped = await identities(album, entry.photos, true, createdAlbums.includes(album.id) ? null : base);
          operations.push(...await copyOperations(trashDir(entry.id), albumDir(album.id), entry.photos, mapped.photos));
          after.set(album.id, touched({ ...album, nextSeq: mapped.nextSeq, photos: [...album.photos, ...mapped.photos] }));
          entries.set(id, entry); restored.push(id);
        }
        await transaction.run({ before: [...before.values()], after: [...after.values()], operations, createdAlbums,
          cleanup: [...entries.keys()].map(trashDir) }, () => {
          for (const [id, album] of after) albums.set(id, album);
          for (const id of entries.keys()) trash.delete(id);
        });
        return { restored };
      });
    },
    async transfer(id, { ids, targetId, mode } = {}) {
      const chosen = selected(ids);
      if (!['copy', 'move'].includes(mode) || targetId === id) throw fail(400, 'bad-request');
      get(id); get(targetId);
      return queue('__transfer__', async () => {
        const source = get(id), target = get(targetId);
        if ([...chosen].some((pid) => !source.photos.some((photo) => photo.id === pid))) throw fail(409, 'order-changed');
        const hashes = new Set(target.photos.map((photo) => photo.sha256).filter(Boolean));
        const originals = [];
        let skipped = 0;
        for (const photo of source.photos.filter((item) => chosen.has(item.id))) {
          if (photo.sha256 && hashes.has(photo.sha256)) { skipped++; continue; }
          if (photo.sha256) hashes.add(photo.sha256);
          originals.push(photo);
        }
        if (!originals.length) return { album: snapshot(source), target: snapshot(target), copied: 0, skipped };
        const mapped = await identities(target, originals);
        const nextTarget = touched({ ...target, nextSeq: mapped.nextSeq, photos: [...target.photos, ...mapped.photos] });
        const moved = new Set(originals.map((photo) => photo.id));
        const nextSource = mode === 'move' ? touched({ ...source, photos: source.photos.filter((photo) => !moved.has(photo.id)),
          cover: moved.has(source.cover) ? null : source.cover }) : source;
        const operations = await copyOperations(albumDir(id), albumDir(targetId), originals, mapped.photos);
        const cleanup = [];
        if (mode === 'move') for (const photo of originals) for (const [sub, file] of await files(albumDir(id), photo)) cleanup.push(join(albumDir(id), sub, file));
        await transaction.run({ before: [target, ...(mode === 'move' ? [source] : [])], after: [nextTarget, ...(mode === 'move' ? [nextSource] : [])],
          operations, cleanup }, () => { albums.set(targetId, nextTarget); albums.set(id, nextSource); });
        return { album: snapshot(nextSource), target: snapshot(nextTarget), copied: originals.length, skipped };
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
  const pendingMetadata = [...albums.values()].flatMap((album) =>
    album.photos.filter((photo) => photo.kind !== 'video' && photo.metadata == null).map((photo) => [album.id, photo.id]));
  metadataJob = (async () => {
    for (const [albumId, photoId] of pendingMetadata) {
      if (closing) break;
      await queue(albumId, async () => {
        const current = albums.get(albumId);
        const record = current?.photos.find((item) => item.id === photoId);
        if (!record || record.metadata != null) return;
        const metadata = await readPhotoMetadata(join(albumDir(albumId), 'originals', asset(record.file)));
        if (metadata.exifStatus === 'unreadable') console.warn('Metadata backfill could not read photo', albumId, photoId);
        await save({ ...current, photos: current.photos.map((item) => item.id === photoId ? { ...item, metadata } : item) });
      }).catch((error) => console.error('Metadata backfill failed', albumId, photoId, error));
    }
  })();
  return library;
}
