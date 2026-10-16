function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function searchTokens(value) {
  return [...new Set(normalizeSearchText(value).match(/[\p{L}\p{N}]+/gu) || [])].slice(0, 10);
}

function productKeywords(product) {
  return searchTokens([product.title, product.description, product.category].filter(Boolean).join(' '));
}

module.exports = { normalizeSearchText, searchTokens, productKeywords };
