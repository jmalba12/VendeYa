function parseServiceAccountJson(value, source = 'FIREBASE_SERVICE_ACCOUNT_JSON') {
  let credentials;
  try {
    credentials = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error(`${source} no contiene JSON válido de una cuenta de servicio de Firebase.`);
  }
  const missing = ['project_id', 'client_email', 'private_key']
    .filter(key => typeof credentials?.[key] !== 'string' || !credentials[key].trim());
  if (missing.length) {
    throw new Error(`${source} no es una cuenta de servicio válida: faltan ${missing.join(', ')}. Descarga la clave JSON de Firebase Admin SDK.`);
  }
  return credentials;
}

module.exports = { parseServiceAccountJson };
