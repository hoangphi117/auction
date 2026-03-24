/**
 * Determine the status of a product based on its state
 * @param {Object} product - Product object with is_sold, end_at, closed_at, highest_bidder_id
 * @returns {string} - Product status: 'SOLD', 'CANCELLED', 'PENDING', 'EXPIRED', or 'ACTIVE'
 */
export function determineProductStatus(product) {
  if (!product) return 'ACTIVE';
  
  const now = new Date();
  const endDate = new Date(product.end_at);
  
  if (product.is_sold === true) return 'SOLD';
  if (product.is_sold === false) return 'CANCELLED';
  if ((endDate <= now || product.closed_at) && product.highest_bidder_id) return 'PENDING';
  if (endDate <= now && !product.highest_bidder_id) return 'EXPIRED';
  if (endDate > now && !product.closed_at) return 'ACTIVE';
  
  return 'ACTIVE';
}

/**
 * Check if product is in a final state (no longer active)
 * @param {string} status - Product status
 * @returns {boolean}
 */
export function isFinalStatus(status) {
  return ['SOLD', 'CANCELLED', 'EXPIRED'].includes(status);
}

/**
 * Check if product can be viewed by anyone (active products)
 * @param {string} status - Product status
 * @returns {boolean}
 */
export function isPubliclyViewable(status) {
  return status === 'ACTIVE';
}
