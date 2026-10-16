const AUTH_ACTIONS = Object.freeze({
  login: 'signInWithPassword',
  exchange: 'signInWithCustomToken'
});

const ERROR_MESSAGES = Object.freeze({
  EMAIL_NOT_FOUND: 'No existe una cuenta con ese correo.',
  INVALID_PASSWORD: 'El correo o la contraseña no son correctos.',
  INVALID_LOGIN_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  USER_DISABLED: 'Esta cuenta está deshabilitada en Firebase Authentication.',
  OPERATION_NOT_ALLOWED: 'Email/Password no está habilitado en Firebase Authentication.',
  API_KEY_INVALID: 'La clave web de Firebase no es válida.',
  API_KEY_SERVICE_BLOCKED: 'Google bloqueó la clave para Identity Toolkit. Revisa las restricciones de la clave.',
  API_KEY_HTTP_REFERRER_BLOCKED: 'El dominio de VendeYa no está autorizado en las restricciones de la clave de Firebase.',
  INVALID_CUSTOM_TOKEN: 'Firebase no aceptó el token de sesión.',
  CREDENTIAL_MISMATCH: 'La configuración de Firebase no coincide con el proyecto de Authentication.',
  PROJECT_NOT_FOUND: 'Firebase no encontró el proyecto asociado a la clave web.'
});

function createFirebaseSessionHandler({
  apiKey = process.env.FIREBASE_WEB_API_KEY,
  fetchImpl = globalThis.fetch,
  logger = console,
  appOrigin = process.env.PUBLIC_APP_ORIGIN || 'https://vendeya-ten-nu.vercel.app'
} = {}) {
  return async function firebaseSession(req, res) {
    const body = req.body || {};
    const action = AUTH_ACTIONS[body.mode];
    if (!action) return res.status(400).json({ error: 'Solicitud de autenticación inválida.' });

    const origin = typeof req.get === 'function' ? req.get('origin') : req.headers?.origin;
    const isLocalOrigin = origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000';
    const isVercelOrigin = typeof origin === 'string' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
    const referer = `${(isLocalOrigin || isVercelOrigin ? origin : appOrigin).replace(/\/$/, '')}/`;

    const payload = body.mode === 'login'
      ? { email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
          password: typeof body.password === 'string' ? body.password : '', returnSecureToken: true }
      : { token: typeof body.customToken === 'string' ? body.customToken : '', returnSecureToken: true };
    if ((body.mode === 'login' && (!payload.email || !payload.password)) ||
        (body.mode === 'exchange' && !payload.token)) {
      return res.status(400).json({ error: 'Faltan datos para autenticar la cuenta.' });
    }
    if (!apiKey) {
      logger.error('[auth.session] stage=config code=FIREBASE_WEB_API_KEY_MISSING');
      return res.status(503).json({ error: 'Firebase Authentication no está configurado.' });
    }

    try {
      const response = await fetchImpl(
        `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(apiKey)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Referer: referer, Origin: referer.replace(/\/$/, '') },
          body: JSON.stringify(payload) }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const rawCode = data.error?.message || '';
        const code = /^[A-Z0-9_]+$/.test(rawCode) ? rawCode : 'UNKNOWN';
        logger.error(`[auth.session] stage=${body.mode} code=${code}`);
        const message = ERROR_MESSAGES[code] || `Firebase Authentication rechazó la solicitud (código: ${code}).`;
        const status = ['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS'].includes(code) ? 401
          : ['USER_DISABLED'].includes(code) ? 403
            : ['API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'OPERATION_NOT_ALLOWED', 'PROJECT_NOT_FOUND', 'CREDENTIAL_MISMATCH'].includes(code) ? 503
              : 400;
        return res.status(status).json({ error: message });
      }
      return res.json({
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        localId: data.localId,
        email: data.email
      });
    } catch (error) {
      const causeCode = error?.cause?.code;
      const code = typeof causeCode === 'string' && /^[A-Z0-9_]+$/.test(causeCode)
        ? causeCode : 'NETWORK_ERROR';
      logger.error(`[auth.session] stage=network code=${code}`);
      return res.status(503).json({ error: 'No se pudo conectar con Firebase Authentication. Revisa la conexión del servidor.' });
    }
  };
}

module.exports = { createFirebaseSessionHandler };

