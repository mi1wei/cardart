const { mkdir, stat, rename, rm, appendFile } = require('node:fs/promises');
const { dirname } = require('node:path');

function createLog(file, { maxBytes = 1024 * 1024 } = {}) {
  let queue = Promise.resolve();
  return (input) => {
    const text = String(input)
      .replace(/([?&]key=|album_key=)[^&;\s"'<>]+/gi, '$1[redacted]')
      .replace(/(Cookie|Authorization):[^\r\n]*/gi, '$1: [redacted]')
      .replace(/("(?:payload|signature)"\s*:\s*")[^"]*"/g, '$1[redacted]"');
    const message = Buffer.from(`${new Date().toISOString()} ${text}\n`).subarray(0, maxBytes);
    queue = queue.catch(() => {}).then(async () => {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const size = await stat(file).then((info) => info.size, (error) => { if (error.code !== 'ENOENT') throw error; return 0; });
      if (size && size + message.length > maxBytes) {
        await rm(`${file}.1`, { force: true });
        await rename(file, `${file}.1`);
      }
      await appendFile(file, message, { mode: 0o600 });
    });
    return queue.catch(() => {});
  };
}

module.exports = { createLog };
