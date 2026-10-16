const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchTokens, productKeywords } = require('../src/search');
const { filterAndSortProducts } = require('../src/catalog');

test('search tokens normalize accents and duplicate terms', () => {
  assert.deepEqual(searchTokens('Audífonos audifonos Bogotá'), ['audifonos', 'bogota']);
});

test('product keywords combine title, description and category', () => {
  assert.deepEqual(productKeywords({ title: 'Libro Azul', description: 'Buen estado', category: 'Hogar' }),
    ['libro', 'azul', 'buen', 'estado', 'hogar']);
});

test('catalog filters search, category, price, legacy products, and orders newest first', () => {
  const products = [
    { id: 'older', title: 'Camisa azul', category: 'Ropa y accesorios', price: 40000, createdAt: { seconds: 10 }, searchKeywords: ['camisa', 'azul'] },
    { id: 'newer', title: 'Camisa roja', description: 'Talla M', category: 'Ropa y accesorios', price: 80000, createdAt: { seconds: 20 } },
    { id: 'other', title: 'Silla', category: 'Hogar', price: 50000, createdAt: { seconds: 30 }, searchKeywords: ['silla'] }
  ];
  const result = filterAndSortProducts(products, {
    category: 'Ropa y accesorios', minPrice: 30000, maxPrice: 90000, terms: ['camisa']
  });
  assert.deepEqual(result.map(product => product.id), ['newer', 'older']);
  assert.deepEqual(filterAndSortProducts(products, { terms: ['silla'] }).map(product => product.id), ['other']);
});

