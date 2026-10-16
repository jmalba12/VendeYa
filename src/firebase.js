const admin = require('firebase-admin');
const fs = require('node:fs');
const { parseServiceAccountJson } = require('./firebase-config');

function initializeFirebase() {
  if (admin.apps.length) return;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
    return;
  }

  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) {
    throw new Error('Configura GOOGLE_APPLICATION_CREDENTIALS con la ruta al JSON de una cuenta de servicio de Firebase Admin SDK, o define FIREBASE_SERVICE_ACCOUNT_JSON.');
  }

  let contents;
  try {
    contents = fs.readFileSync(credentialPath, 'utf8');
  } catch {
    throw new Error('No se pudo leer el archivo indicado por GOOGLE_APPLICATION_CREDENTIALS. Verifica la ruta y los permisos.');
  }
  const serviceAccount = parseServiceAccountJson(contents, 'El archivo indicado por GOOGLE_APPLICATION_CREDENTIALS');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}

initializeFirebase();
const db = admin.firestore();
const auth = admin.auth();
module.exports = { admin, db, auth };
