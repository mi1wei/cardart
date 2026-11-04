// What Settings shows about the desktop app (polish spec §6.4).

// The library path as people know it: the home folder written as ~, a Unix habit Windows does not share.
function displayPath(path, home, platform) {
  if (platform === 'win32' || !home) return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function desktopInfo({ version, libraryDir, home, platform, update }) {
  return { version, library: displayPath(libraryDir, home, platform), update };
}

module.exports = { desktopInfo, displayPath };
