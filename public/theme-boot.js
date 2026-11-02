// Puts a saved light/dark choice on <html> before the first paint (v2 spec §3); auto needs nothing.
// A file, not inline: the page's CSP allows only same-origin scripts.
try {
  const mode = localStorage.getItem('theme');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
} catch {}
