const test = require('node:test');
const assert = require('node:assert/strict');
const { createFirebaseSessionHandler } = require('../src/firebase-auth');

function setup({ apiKey = 'test-public-key', fetchImpl } = {}) {
  const calls = { fetch: [], logs: [] };
  const handler = createFirebaseSessionHandler({
    apiKey,
    fetchImpl: fetchImpl || (async (url, options) => {
      calls.fetch.push({ url, options });
      return { ok: true, json: async () => ({ idToken: 'id-token', refreshToken: 'refresh-token', localId: 'uid-1' }) };
    }),
    logger: { error: message => calls.logs.push(message) }
  });
  const result = { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { handler, calls, result };
}

test('custom token exchange uses Firebase Auth on the server with the production referrer', async () => {
  const ctx = setup();
  await ctx.handler({ body: { mode: 'exchange', customToken: 'custom-token' }, get: () => 'https://vendeya-ten-nu.vercel.app' }, ctx.result);
  assert.equal(ctx.result.statusCode, 200);
  assert.equal(ctx.result.body.idToken, 'id-token');
  assert.match(ctx.calls.fetch[0].url, /accounts:signInWithCustomToken/);
  assert.equal(ctx.calls.fetch[0].options.headers.Referer, 'https://vendeya-ten-nu.vercel.app/');
  assert.equal(JSON.parse(ctx.calls.fetch[0].options.body).token, 'custom-token');
});

test('password login returns a safe Firebase error code as a useful message', async () => {
  const ctx = setup({ fetchImpl: async () => ({ ok: false, json: async () => ({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }) }) });
  await ctx.handler({ body: { mode: 'login', email: 'ana@example.com', password: 'secret-pass' }, get: () => 'https://vendeya-ten-nu.vercel.app' }, ctx.result);
  assert.equal(ctx.result.statusCode, 401);
  assert.match(ctx.result.body.error, /correo o la contraseña/);
  assert.doesNotMatch(ctx.calls.logs.join(' '), /secret-pass|ana@example.com/);
  assert.match(ctx.calls.logs[0], /INVALID_LOGIN_CREDENTIALS/);
});

test('missing Firebase web key is reported without attempting the request', async () => {
  const ctx = setup({ apiKey: '' });
  await ctx.handler({ body: { mode: 'exchange', customToken: 'custom-token' }, get: () => 'https://vendeya-ten-nu.vercel.app' }, ctx.result);
  assert.equal(ctx.result.statusCode, 503);
  assert.equal(ctx.calls.fetch.length, 0);
  assert.match(ctx.calls.logs[0], /FIREBASE_WEB_API_KEY_MISSING/);
});

test('unsupported modes and missing credentials are rejected before calling Firebase', async () => {
  const ctx = setup();
  await ctx.handler({ body: { mode: 'root' }, get: () => null }, ctx.result);
  assert.equal(ctx.result.statusCode, 400);
  assert.equal(ctx.calls.fetch.length, 0);
});

