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

module.exports = { isAppURL, isAllowedPermission, parseReady };
