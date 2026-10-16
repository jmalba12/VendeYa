const validEmail = value => /^\S+@\S+\.\S+$/.test(value);
const clean = value => typeof value === 'string' ? value.trim() : '';

function firebaseRegistrationError(code) {
  if (code === 'auth/email-already-exists')
    return { status: 409, message: 'Ese correo ya está registrado.' };
  if (['auth/invalid-email', 'auth/invalid-password', 'auth/weak-password', 'auth/invalid-display-name', 'auth/invalid-phone-number'].includes(code))
    return { status: 400, message: 'Firebase rechazó los datos de registro. Revisa el correo, el teléfono y la contraseña.' };
  if (code === 'auth/operation-not-allowed' || code === 'OPERATION_NOT_ALLOWED')
    return { status: 503, message: 'El proveedor Email/Password no está habilitado en Firebase Authentication.' };
  if (code === 'auth/invalid-credential' || code === 'auth/project-not-found' || code === 'PROJECT_NOT_FOUND' || code === 'CREDENTIAL_MISMATCH')
    return { status: 503, message: 'La configuración de Firebase no coincide con el proyecto de Authentication.' };
  if (code === 'app/invalid-credential' || code === 'GOOGLE_OAUTH_NETWORK_UNAVAILABLE')
    return { status: 503, message: 'Firebase Admin no pudo autenticarse con Google. Verifica la clave de servicio y la conexión de red del servidor.' };
  if (typeof code === 'string' && (code.startsWith('auth/') || ['UNAVAILABLE', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'RESOURCE_EXHAUSTED'].includes(code)))
    return { status: 503, message: 'Firebase no pudo completar el registro. Revisa la configuración y los permisos del proyecto.' };
  return { status: 500, message: 'No se pudo completar el registro. Revisa el diagnóstico del servidor.' };
}

function createRegistrationHandler({ auth, db, admin, logger = console }) {
  return async function register(req, res) {
    const body = req.body || {};
    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const phone = clean(body.phone);
    const digits = phone.replace(/\D/g, '').length;

    if (name.length < 2 || !validEmail(email) || password.length < 8 ||
        !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) ||
        digits < 7 || phone.length > 20 || /[^\d+\s()-]/.test(phone)) {
      return res.status(400).json({ error: 'Revisa nombre, correo y teléfono; la contraseña requiere 8 caracteres, mayúscula, minúscula y número.' });
    }

    let user;
    let stage = 'create-user';
    try {
      user = await auth.createUser({ displayName: name, email, password });
      stage = 'write-profile';
      await db.collection('users').doc(user.uid).set({
        uid: user.uid, name, email, phone, role: 'user',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      stage = 'create-custom-token';
      const customToken = await auth.createCustomToken(user.uid);
      return res.status(201).json({
        uid: user.uid, customToken,
        user: { uid: user.uid, email, name, role: 'user' }
      });
    } catch (error) {
      const oauthNetworkFailure = /failed to fetch a valid Google OAuth2 access token/i.test(error.message || '') && /EACCES|ECONNRESET|ENOTFOUND/i.test(error.message || '');
      const code = oauthNetworkFailure ? 'GOOGLE_OAUTH_NETWORK_UNAVAILABLE' : (error.firebaseCode || error.code || 'UNKNOWN');
      logger.error(`[auth.register] stage=${stage} code=${String(code).replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 80)}`);
      if (user) {
        try { await db.collection('users').doc(user.uid).delete(); }
        catch (cleanupError) {
          logger.error(`[auth.register] stage=rollback-profile code=${String(cleanupError.code || 'UNKNOWN').replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 80)}`);
        }
        try { await auth.deleteUser(user.uid); }
        catch (cleanupError) {
          logger.error(`[auth.register] stage=rollback-auth code=${String(cleanupError.code || 'UNKNOWN').replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 80)}`);
        }
      }
      const mapped = firebaseRegistrationError(oauthNetworkFailure ? 'GOOGLE_OAUTH_NETWORK_UNAVAILABLE' : (error.firebaseCode || error.code));
      return res.status(mapped.status).json({ error: mapped.message });
    }
  };
}

module.exports = { createRegistrationHandler, firebaseRegistrationError };
