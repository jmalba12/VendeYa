const { searchTokens } = require('./search');

function createdAtMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByCreatedAtDesc(items) {
  return items.sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt));
}

function filterAndSortProducts(products, { category = '', minPrice = null, maxPrice = null, terms = [] } = {}) {
  return sortByCreatedAtDesc(products.filter(product => {
    const price = Number(product.price);
    if (category && product.category !== category) return false;
    if (minPrice !== null && (!Number.isFinite(price) || price < minPrice)) return false;
    if (maxPrice !== null && (!Number.isFinite(price) || price > maxPrice)) return false;
    if (terms.length) {
      const keywords = Array.isArray(product.searchKeywords)
        ? product.searchKeywords
        : searchTokens([product.title, product.description, product.category].filter(Boolean).join(' '));
      if (!terms.some(term => keywords.includes(term))) return false;
    }
    return true;
  }));
}

module.exports = { filterAndSortProducts, sortByCreatedAtDesc };
