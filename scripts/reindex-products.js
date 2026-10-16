require('dotenv').config();
const { db } = require('../src/firebase');
const { productKeywords } = require('../src/search');

async function main() {
  const apply = process.argv.includes('--apply');
  let cursor = null, updated = 0;
  do {
    let query = db.collection('products').orderBy('__name__').limit(400);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (!page.size) break;
    const batch = db.batch();
    let pageUpdates = 0;
    for (const doc of page.docs) {
      const data = doc.data();
      if (Array.isArray(data.searchKeywords)) continue;
      updated++; pageUpdates++;
      if (apply) batch.update(doc.ref, {
        searchKeywords: productKeywords(data)
      });
    }
    if (apply && pageUpdates) await batch.commit();
    cursor = page.docs.at(-1);
    if (page.size < 400) break;
  } while (cursor);
  console.log(`${apply ? 'Indexados' : 'Pendientes de indexar'}: ${updated} productos.`);
  if (!apply) console.log('Usa npm run index:products para aplicar los cambios.');
}

main().catch(error => {
  console.error('No se pudo preparar el índice de texto:', error.message);
  process.exitCode = 1;
});
