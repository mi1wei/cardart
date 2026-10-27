import { defineConfig } from 'vite';
import { createHandler } from './server/app.js';
import { DEFAULT_DIR, openLibrary } from './server/library.js';

let library;
// Dev only: the same API as `npm start`, in the Vite process (spec §4). Added directly in
// configureServer, so it runs before Vite's own middlewares and guards every request.
export default defineConfig({
  plugins: [
    {
      name: 'album-api',
      async configureServer(server) {
        const lib = await openLibrary(process.env.ALBUM_LIBRARY || DEFAULT_DIR);
        library = lib;
        server.middlewares.use(createHandler(lib));
        server.httpServer?.once('error', () => { void lib.close().catch(console.error); });
      },
      async closeBundle() { await library?.close(); },
    },
  ],
});
