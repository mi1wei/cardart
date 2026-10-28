import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.js';
import { DEFAULT_DIR } from './library.js';

const dir = process.env.ALBUM_LIBRARY || DEFAULT_DIR;
const port = Number(process.env.PORT) || 5180;
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

try {
  const { url, close } = await startServer({ dir, port, dist });
  const stop = () => { void close().catch((error) => { console.error(error); process.exitCode = 1; }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(`册页已启动：${url}；相册库：${dir}\nFolio is running: ${url}; library: ${dir}`);
} catch (err) {
  if (err.code === 'EADDRINUSE') console.error(`端口 ${port} 被占用，可以用 PORT=xxxx npm start 换一个\nPort ${port} is in use. Try PORT=xxxx npm start.`);
  else if (['EACCES', 'EPERM', 'EROFS', 'ENOTDIR'].includes(err.code)) {
    console.error(`相册库目录不可写：${dir}（${err.message}）\nThe library folder isn't writable: ${dir} (${err.message})`);
  } else console.error(err);
  process.exit(1);
}
