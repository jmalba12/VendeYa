const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('frontend selectors exist in the HTML page', () => {
  const html = read('public/index.html');
  const js = read('public/app.js');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const selectors = [...js.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  assert.deepEqual([...new Set(selectors)].filter(id => !ids.has(id)), []);
});

test('registration returns Firebase ID tokens and validates account data', () => {
  const app = read('src/app.js');
  const registration = read('src/registration.js');
  const frontend = read('public/app.js');
  assert.match(app, /app\.post\('\/api\/auth\/register', createRegistrationHandler/);
  assert.match(registration, /auth\.createCustomToken/);
  assert.match(registration, /idToken: session\.idToken/);
  assert.match(registration, /auth\/email-already-exists/);
  assert.match(frontend, /api\('\/api\/auth\/register'/);
  assert.match(frontend, /Object\.assign\(body, \{ name, phone \}\)/);
});

test('frontend explains that file URLs cannot reach the VendeYa API', () => {
  const client = read('public/app.js');
  const html = read('public/index.html');
  assert.match(client, /window\.location\.protocol === 'file:'/);
  assert.match(client, /Abre VendeYa desde http:\/\/localhost:3000/);
  assert.match(html, /window\.location\.replace\('http:\/\/localhost:3000\/' \+ window\.location\.hash\)/);
});

test('server loads local credentials and explains port conflicts', () => {
  const server = read('server.js');
  const app = read('src/app.js');
  assert.match(server, /localCredentialPath/);
  assert.match(server, /!fs\.existsSync\(process\.env\.GOOGLE_APPLICATION_CREDENTIALS\)/);
  assert.match(server, /error\.code === 'EADDRINUSE'/);
  assert.match(server, /configura PORT en \.env/);
});

test('private product and order endpoints enforce authentication', () => {
  const app = read('src/app.js');
  assert.match(app, /app\.post\('\/api\/products', requireAuth/);
  assert.match(app, /app\.post\('\/api\/orders', requireAuth/);
  assert.match(app, /app\.put\('\/api\/products\/:id', requireAuth/);
});

test('demo order transaction rejects self-requests, duplicates, and false product sales', () => {
  const app = read('src/app.js');
  assert.match(app, /p\.sellerId === req\.user\.uid/);
  assert.match(app, /p\.status !== 'available'/);
  assert.match(app, /db\.runTransaction/);
  assert.match(app, /paymentStatus: 'not_integrated'/);
  assert.match(app, /status: 'demo_request'/);
  assert.match(app, /existingRequest\.exists/);
  assert.doesNotMatch(app.slice(app.indexOf("app.post('/api/orders'"), app.indexOf("app.get('/api/seller/dashboard'")), /tx\.update\(productRef/);
});

test('checkout requires delivery address and reports payment as pending', () => {
  const html = read('public/index.html');
  const app = read('src/app.js');
  assert.match(html, /id="deliveryAddress" required/);
  assert.match(html, /sin cobro/);
  assert.match(app, /deliveryAddress\.length < 8/);
});

test('catalog uses indexed terms and supports validated pagination', () => {
  const app = read('src/app.js');
  assert.match(app, /where\('status', '==', status\)/);
  assert.match(app, /filterAndSortProducts\(allProducts/);
  assert.match(app, /filteredProducts\.slice\(\(page - 1\) \* limit, page \* limit\)/);
  assert.doesNotMatch(app, /\.orderBy\(/);
});

test('client Firestore rules deny direct access', () => {
  assert.match(read('firestore.rules'), /allow read, write: if false/);
});

test('frontend availability filter is wired to validated API query', () => {
  const html = read('public/index.html');
  const client = read('public/app.js');
  const app = read('src/app.js');
  assert.match(html, /id=\"availabilityFilter\"/);
  assert.match(client, /\['availability','availabilityFilter'\]/);
  assert.match(app, /availability = clean\(req\.query\.availability\) \\|\\| 'available'/);
  assert.match(app, /!\['available', 'sold', 'all'\]\.includes\(availability\)/);
});

test('four account, sell, discover and buy stories have connected endpoints', () => {
  const client = read('public/app.js');
  const app = read('src/app.js');
  assert.match(client, /api\('\/api\/auth\/register'/);
  assert.match(client, /api\('\/api\/auth\/login'/);
  assert.match(client, /api\('\/api\/products'/);
  assert.match(client, /api\('\/api\/orders'/);
  assert.match(app, /app\.post\('\/api\/auth\/register'/);
  assert.match(app, /app\.post\('\/api\/auth\/login'/);
  assert.match(app, /app\.get\('\/api\/products'/);
  assert.match(app, /app\.post\('\/api\/orders'/);
});


test('seller dashboard and purchases avoid composite-index queries', () => {
  const app = read('src/app.js');
  const client = read('public/app.js');
  const html = read('public/index.html');
  assert.match(app, /app\.get\('\/api\/seller\/dashboard', requireAuth/);
  assert.match(app, /\.where\('sellerId', '==', req\.user\.uid\)/);
  assert.match(app, /salesSnapshot\.docs\.filter\(doc => doc\.data\(\)\.paymentStatus === 'paid'\)/);
  assert.match(app, /collection\.where\('buyerId', '==', req\.user\.uid\)\.get\(\)/);
  assert.doesNotMatch(app, /\.orderBy\(/);
  assert.doesNotMatch(app, /\.where\('paymentStatus', '==', 'paid'\)/);
  assert.match(client, /api\('\/api\/seller\/dashboard'\)/);
  for (const id of ['statPublished', 'statActive', 'statSold', 'statSales', 'sellerProductsList'])
    assert.match(html, new RegExp(`id=\"${id}\"`));
});

test('editing indexed product fields refreshes the search keywords', () => {
  const app = read('src/app.js');
  assert.match(app, /update\.searchKeywords = productKeywords\(\{ \.\.\.p, \.\.\.update \}\)/);
});

test('product upload verifies image signatures and cleans cloud uploads on Firestore failure', () => {
  const app = read('src/app.js');
  assert.match(app, /files\.some\(file => !hasValidImageSignature\(file\)\)/);
  assert.match(app, /Promise\.allSettled\(images\.map\(image => cloudinary\.uploader\.destroy\(image\.publicId\)\)\)/);
});

test('publishing refreshes both the catalog and seller dashboard', () => {
  const client = read('public/app.js');
  const app = read('src/app.js');
  assert.match(client, /await Promise\.all\(\[loadProducts\(\), loadSellerDashboard\(\)\]\)/);
  assert.match(app, /upload\.array\('images', 5\)/);
  assert.match(app, /req\.body\.title/);
  assert.match(app, /req\.files/);
  assert.match(app, /firestorePermissionDenied/);
});

