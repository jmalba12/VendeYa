const test = require('node:test');
const assert = require('node:assert/strict');
const { hasValidImageSignature } = require('../src/validation');

test('image validation matches MIME labels to actual JPEG, PNG, and WebP signatures', () => {
  assert.equal(hasValidImageSignature({ mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) }), true);
  assert.equal(hasValidImageSignature({ mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]) }), true);
  assert.equal(hasValidImageSignature({ mimetype: 'image/webp', buffer: Buffer.from('RIFFxxxxWEBPdata') }), true);
  assert.equal(hasValidImageSignature({ mimetype: 'image/jpeg', buffer: Buffer.from('not an image') }), false);
  assert.equal(hasValidImageSignature({ mimetype: 'image/png', buffer: Buffer.from([0xff, 0xd8, 0xff]) }), false);
  assert.equal(hasValidImageSignature({ mimetype: 'image/gif', buffer: Buffer.from('GIF89a') }), false);
});
