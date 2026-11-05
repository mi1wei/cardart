// What the page learns about the desktop app (polish spec §6.4): Settings shows the version, the
// library and the update state; a page loaded in full screen closes the traffic-light gap.

// The library path as people know it: the home folder written as ~, a Unix habit Windows does not share.
function displayPath(path, home, platform) {
  if (platform === 'win32' || !home) return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function desktopInfo({ version, libraryDir, home, platform, update, fullscreen }) {
  return { version, library: displayPath(libraryDir, home, platform), update, fullscreen };
}

module.exports = { desktopInfo, displayPath };
