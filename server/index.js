import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.js';
import { DEFAULT_DIR } from './library.js';

const dir = process.env.ALBUM_LIBRARY || DEFAULT_DIR;
const port = Number(process.env.PORT) || 5180;
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

try {
  const { url } = await startServer({ dir, port, dist });
  console.log(`相册已启动：${url}\n相册库：${dir}`);
} catch (err) {
  if (err.code === 'EADDRINUSE') console.error(`端口 ${port} 被占用，可以用 PORT=xxxx npm start 换一个`);
  else if (['EACCES', 'EPERM', 'EROFS', 'ENOTDIR'].includes(err.code)) console.error(`相册库目录不可写：${dir}（${err.message}）`);
  else console.error(err);
  process.exit(1);
}
