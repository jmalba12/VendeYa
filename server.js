const fs = require('node:fs');
const dotenvResult = require('dotenv').config();
// A stale OS-level path should not hide the valid local credential path in .env.
const localCredentialPath = dotenvResult.parsed?.GOOGLE_APPLICATION_CREDENTIALS;
if (localCredentialPath && (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS))) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = localCredentialPath;
}
const app = require('./src/app');
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`VendeYa lista en http://localhost:${PORT}`));
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${PORT} ya está ocupado. Cierra el proceso que lo usa o configura PORT en .env.`);
    } else {
      console.error(`[server] ${error.code || 'ERROR'}: no se pudo iniciar VendeYa.`);
    }
    process.exitCode = 1;
  });
}

module.exports = app;