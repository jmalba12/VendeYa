const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistrationHandler, firebaseRegistrationError } = require('../src/registration');

function setup({ createUser = async () => ({ uid: 'user-1' }) } = {}) {
  const calls = { createUser: [], profile: [], deletedProfile: [], deletedUser: [], logs: [] };
  const auth = {
    createUser: async value => { calls.createUser.push(value); return createUser(value); },
    createCustomToken: async uid => `custom-${uid}`,
    deleteUser: async uid => calls.deletedUser.push(uid)
  };
  const db = { collection: name => ({ doc: uid => ({
    set: async value => calls.profile.push({ name, uid, value }),
    delete: async () => calls.deletedProfile.push({ name, uid })
  }) }) };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } };
  const logger = { error: message => calls.logs.push(message) };
  const handler = createRegistrationHandler({ auth, db, admin, logger });
  const req = { body: { name: 'Ana Pérez', email: ' ANA@example.com ', password: 'ClaveSegura1', phone: '+57 300 123 4567' } };
  const result = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { handler, req, result, calls };
}

test('registration handler returns a custom token after Firebase account and profile creation succeed', async () => {
  const ctx = setup();
  await ctx.handler(ctx.req, ctx.result);
  assert.equal(ctx.result.statusCode, 201);
  assert.equal(ctx.result.body.customToken, 'custom-user-1');
  assert.equal(ctx.result.body.user.email, 'ana@example.com');
  assert.equal(ctx.calls.profile.length, 1);
  assert.equal(ctx.calls.createUser[0].password, 'ClaveSegura1');
});

test('duplicate Firebase email returns 409 and logs only a safe error code', async () => {
  const ctx = setup({ createUser: async () => { throw Object.assign(new Error('sensitive'), { code: 'auth/email-already-exists' }); } });
  await ctx.handler(ctx.req, ctx.result);
  assert.equal(ctx.result.statusCode, 409);
  assert.match(ctx.result.body.error, /ya está registrado/);
  assert.match(ctx.calls.logs[0], /auth\/email-already-exists/);
  assert.doesNotMatch(ctx.calls.logs.join(' '), /ClaveSegura1|ANA@example\.com|sensitive/);
});

test('invalid registration data returns 400 without calling Firebase', async () => {
  const ctx = setup();
  ctx.req.body.password = 'weak';
  await ctx.handler(ctx.req, ctx.result);
  assert.equal(ctx.result.statusCode, 400);
  assert.equal(ctx.calls.createUser.length, 0);
});

test('Firebase provider disabled maps to actionable service-unavailable response', () => {
  assert.deepEqual(firebaseRegistrationError('OPERATION_NOT_ALLOWED'), {
    status: 503,
    message: 'El proveedor Email/Password no está habilitado en Firebase Authentication.'
  });
});

test('Google OAuth network failure returns an actionable 503 without exposing SDK details', async () => {
  const ctx = setup({ createUser: async () => { throw Object.assign(new Error('failed to fetch a valid Google OAuth2 access token: connect EACCES'), { code: 'app/invalid-credential' }); } });
  await ctx.handler(ctx.req, ctx.result);
  assert.equal(ctx.result.statusCode, 503);
  assert.match(ctx.result.body.error, /conexión de red/);
  assert.match(ctx.calls.logs[0], /GOOGLE_OAUTH_NETWORK_UNAVAILABLE/);
  assert.doesNotMatch(ctx.calls.logs.join(' '), /ClaveSegura1|ANA@example\.com|EACCES/);
});
