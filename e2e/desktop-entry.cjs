const path = require('node:path');
(async () => {
  const { startDesktop } = require('../desktop/main.cjs');
  global.folioTestDesktop = await startDesktop({
    appRoot: path.resolve(__dirname, '..'),
    licensePublicKeyFile: process.env.FOLIO_E2E_KEY_FILE,
  });
})().catch((error) => {
  console.error(error.code || error.message);
  process.exit(1);
});
