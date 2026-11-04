function isAppURL(target, origin) {
  try {
    const url = new URL(target);
    return url.protocol === 'http:' && url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}

function isAllowedPermission(permission, target, origin) {
  return isAppURL(target, origin) && ['fullscreen', 'clipboard-sanitized-write'].includes(permission);
}

function parseReady(message) {
  if (message?.type !== 'ready' || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) throw new Error('Invalid backend ready message');
  const url = new URL(message.origin);
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.username || url.password ||
    Number(url.port || 80) !== message.port || message.origin !== url.origin) throw new Error('Invalid backend origin');
  return url.origin;
}

function isOriginalURL(target, origin) {
  if (!isAppURL(target, origin)) return false;
  const url = new URL(target);
  return !url.search && !url.hash && /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/p\d{3,}\/original$/.test(url.pathname);
}

// Only the app page in the main window may use the desktop channels (polish spec §6.4).
function isAppSender(event, window, origin) {
  return Boolean(window) && !window.isDestroyed() && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame && isAppURL(event.senderFrame?.url, origin);
}

module.exports = { isAppURL, isAllowedPermission, parseReady, isOriginalURL, isAppSender };
