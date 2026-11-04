// Files for an import, gathered from a drop or from <input webkitdirectory> (polish spec §5).
// Inside a chosen folder, names starting with "." and Windows' hidden desktop.ini and Thumbs.db are
// left out without a count; videos in other formats are counted as `unsupported`, other files that
// are not photos or videos as `skipped`; what cannot be read counts as `unreadable`, which the import
// reports as failed.

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
const BY_NAME = /\.(heic|heif|mp4|mov|m4v)$/i;
const OTHER_VIDEO = /\.(avi|mkv|webm|wmv|flv|mts|m2ts|3gp|mpe?g|ogv)$/i;

// The album page's file input accepts the same: image/*,.heic,.heif,video/mp4,…,.mov,.m4v.
export function importable(file) {
  const type = String(file.type ?? '').toLowerCase();
  return type.startsWith('image/') || VIDEO_TYPES.includes(type) || BY_NAME.test(file.name);
}

const hidden = (name) => name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(name);
const otherVideo = (file) => String(file.type ?? '').toLowerCase().startsWith('video/') || OTHER_VIDEO.test(file.name);
const byPath = (a, b) => a.path.localeCompare(b.path, undefined, { numeric: true });

// Sorted by path, so IMG_2 comes before IMG_10, then split into what to import and counts of the rest.
function sortOut(found, unreadable) {
  const files = [];
  let skipped = 0;
  let unsupported = 0;
  for (const { file } of found.sort(byPath)) {
    if (importable(file)) files.push(file);
    else if (otherVideo(file)) unsupported++;
    else skipped++;
  }
  return { files, skipped, unsupported, unreadable };
}

// <input webkitdirectory> picks one folder: every path starts with its name.
export function pickedFolder(list) {
  const found = [];
  let name = '';
  for (const file of list) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    name ||= parts[0];
    const inside = parts.slice(1);
    if (!inside.some(hidden)) found.push({ path: inside.join('/'), file });
  }
  return name ? { name, ...sortOut(found, 0) } : null;
}

const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

// readEntries() hands out at most 100 entries a call in Chromium: read until it returns none.
async function children(folder) {
  const reader = folder.createReader();
  const all = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

// Adds the folder's files, at any depth, to `found`; returns how many could not be read.
async function walk(folder, prefix, found) {
  let list;
  try { list = await children(folder); } catch { return 1; }
  let unreadable = 0;
  for (const entry of list) {
    if (hidden(entry.name)) continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory) unreadable += await walk(entry, `${path}/`, found);
    else {
      try { found.push({ path, file: await fileOf(entry) }); }
      catch { unreadable++; }
    }
  }
  return unreadable;
}

async function read(taken) {
  const folders = [];
  const loose = [];
  let unreadable = 0;
  for (const { entry, file } of taken) {
    if (entry?.isDirectory) {
      const found = [];
      const failed = await walk(entry, '', found);
      folders.push({ name: entry.name, ...sortOut(found, failed) });
    } else if (file) loose.push({ path: file.name, file });
    else if (entry?.isFile) {
      try {
        const loaded = await fileOf(entry);
        loose.push({ path: loaded.name, file: loaded });
      } catch { unreadable++; }
    } else unreadable++;
  }
  return { folders, loose: sortOut(loose, unreadable) };
}

// A drop: each top-level folder is one group, everything else is `loose`. The browser empties the
// item list once the drop event is over, so every item is taken here, before the first await.
export function collectDrop(transfer) {
  const taken = [];
  const items = transfer.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') taken.push({ entry: item.webkitGetAsEntry?.() ?? null, file: item.getAsFile() });
    }
  } else for (const file of transfer.files ?? []) taken.push({ entry: null, file });
  return read(taken);
}

// Album names follow the server's rule: trimmed, at most 50 characters counted as code points.
export function albumTitle(name, fallback) {
  return [...name.trim()].slice(0, 50).join('').trim() || fallback;
}
