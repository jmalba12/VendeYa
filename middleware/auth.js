const { auth, db } = require('../src/firebase');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Debes iniciar sesión para usar este endpoint.' });
    const decoded = await auth.verifyIdToken(match[1]);
    const profileSnap = await db.collection('users').doc(decoded.uid).get();
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      name: profileSnap.exists ? (profileSnap.data().name || '') : '',
      role: profileSnap.exists ? (profileSnap.data().role || 'user') : 'user'
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión inválida o vencida. Inicia sesión nuevamente.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Esta acción requiere permisos de administrador.' });
  next();
}

module.exports = { requireAuth, requireAdmin };