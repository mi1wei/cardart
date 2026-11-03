// Light, dark or follow the system (v2 spec §3). Each device keeps its own choice.
const KEY = 'theme';
const MODES = ['light', 'dark', 'auto'];
const system = matchMedia('(prefers-color-scheme: dark)');

export const themeSupported = () => typeof CSS !== 'undefined' && CSS.supports('color', 'light-dark(#000, #fff)');

// public/theme-boot.js has already put a saved choice on <html> before the first paint.
export function theme() {
  const mode = document.documentElement.dataset.theme;
  return mode === 'light' || mode === 'dark' ? mode : 'auto';
}

export function setTheme(mode) {
  if (!MODES.includes(mode)) return;
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {}
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  document.dispatchEvent(new Event('folio-theme'));
}

// Calls fn whenever the colours may have changed: a choice here, or the system switching in auto mode.
export function onThemeChange(fn) {
  document.addEventListener('folio-theme', fn);
  system.addEventListener('change', fn);
  return () => {
    document.removeEventListener('folio-theme', fn);
    system.removeEventListener('change', fn);
  };
}
