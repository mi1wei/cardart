// Puts a saved light/dark choice on <html> before the first paint (v2 spec §3); auto needs nothing.
// A file, not inline: the page's CSP allows only same-origin scripts.
try {
  const mode = localStorage.getItem('theme');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
} catch {}
// In the desktop app the top bar is the window's title bar (polish spec §6.1); mark it before painting.
try {
  const platform = window.folioDesktop?.platform;
  if (platform === 'mac' || platform === 'win') document.documentElement.dataset.desktop = platform;
} catch {}
