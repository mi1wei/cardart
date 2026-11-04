// Hash routes (polish spec §3.1): #/albums · #/trash · #/license · #/a/<id> · #/a/<id>/p/<photo> ·
// #/a/<id>/3d · #/a/<id>/3d/p/<photo>. There is no home page: anything else shows the album wall.
let listener = () => {};
let emittedHash;

export function parse(hash) {
  const m = /^#\/a\/([0-9a-f-]{36})(\/3d)?(?:\/p\/(p\d{3,}))?$/.exec(hash);
  if (m) return { page: 'album', album: m[1], three: !!m[2], photo: m[3] ?? null };
  return { page: { '#/trash': 'trash', '#/license': 'license' }[hash] ?? 'albums', album: null, three: false, photo: null };
}

// The address a hash should show: the old home page and unknown addresses become #/albums.
export function canonical(hash) {
  return parse(hash).page === 'albums' ? '#/albums' : hash;
}

const emit = () => {
  // Replaced, not pushed, so Back never returns to an address that only redirects. The URL is
  // relative, so the query stays: a phone's ?key= must survive (spec §12).
  const target = canonical(location.hash);
  if (target !== location.hash) history.replaceState(history.state, '', target);
  const previous = emittedHash ?? location.hash;
  emittedHash = location.hash;
  listener(parse(location.hash), previous);
};

export function start(fn) {
  listener = fn;
  window.addEventListener('hashchange', emit);
  emit();
}

// A new history entry, so the back button undoes it.
export function open(hash) {
  history.pushState({ inApp: true }, '', hash);
  emit();
}

// Goes back when the entry was opened in the app; otherwise (e.g. after a reload) replaces it.
export function close(hash) {
  if (history.state?.inApp) history.back();
  else {
    history.replaceState(null, '', hash);
    emit();
  }
}

// Changes the address only: no new entry, no re-render (paging in the lightbox).
export function swap(hash) {
  history.replaceState(history.state, '', hash);
  emittedHash = location.hash;
}
