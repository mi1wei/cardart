// Hash routes (spec §5): #/ home · #/albums · #/a/<id> · #/a/<id>/p/<photo> · #/a/<id>/3d · #/a/<id>/3d/p/<photo>
let listener = () => {};
let emittedHash;

// Anything the app does not know shows the home page.
export function parse(hash) {
  const m = /^#\/a\/([0-9a-f-]{36})(\/3d)?(?:\/p\/(p\d{3,}))?$/.exec(hash);
  if (m) return { page: 'album', album: m[1], three: !!m[2], photo: m[3] ?? null };
  return { page: hash === '#/albums' ? 'albums' : hash === '#/license' ? 'license' : 'home', album: null, three: false, photo: null };
}

const emit = () => {
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
