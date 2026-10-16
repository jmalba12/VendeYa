const test = require('node:test');
const assert = require('node:assert/strict');
const { parseServiceAccountJson } = require('../src/firebase-config');

test('Firebase Admin configuration accepts a service account with a project ID', () => {
  const account = { project_id: 'demo-project', client_email: 'admin@example.iam.gserviceaccount.com', private_key: 'private-key' };
  assert.equal(parseServiceAccountJson(JSON.stringify(account)).project_id, 'demo-project');
});

test('Firebase Admin configuration rejects a Firestore-only config with actionable missing fields', () => {
  assert.throws(() => parseServiceAccountJson(JSON.stringify({ firestore: {} }), 'GOOGLE_APPLICATION_CREDENTIALS'),
    /not a valid service account|no es una cuenta de servicio válida: faltan project_id, client_email, private_key/);
});

test('Firebase Admin configuration rejects malformed JSON without echoing its contents', () => {
  assert.throws(() => parseServiceAccountJson('{"private_key":"DO_NOT_LOG"'), error => {
    assert.match(error.message, /no contiene JSON válido/);
    assert.doesNotMatch(error.message, /DO_NOT_LOG/);
    return true;
  });
});
