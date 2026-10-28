import { openLibrary } from '../../server/library.js';

const lib = await openLibrary(process.argv[2]);
const album = await lib.create('Held');
process.on('message', async (message) => {
  if (message === 'close') {
    await lib.close();
    process.exit(0);
  }
});
process.send({ id: album.id });
