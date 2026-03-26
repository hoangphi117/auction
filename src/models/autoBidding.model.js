import db from '../utils/db.js';

/**
 * Lấy tất cả sản phẩm mà bidder đang tham gia đấu giá
 * @param {number} bidderId - ID người đặt giá
 * @returns {Promise<Array>} Danh sách sản phẩm
 */
export async function getBiddingProductsByBidderId(bidderId) {
  return db('auto_bidding')
    .join('products', 'auto_bidding.product_id', 'products.id')
    .leftJoin('categories', 'products.category_id', 'categories.id')
    .where('auto_bidding.bidder_id', bidderId)
    .where('products.end_at', '>', new Date())
    .whereNull('products.closed_at')
    .select(
      'products.*',
      'categories.name as category_name',
      'auto_bidding.max_price as my_max_bid',
      db.raw(`
        CASE 
          WHEN products.highest_bidder_id = ? THEN true 
          ELSE false 
        END AS is_winning
      `, [bidderId]),
      db.raw(`
        (
          SELECT COUNT(*) 
          FROM bidding_history 
          WHERE bidding_history.product_id = products.id
        ) AS bid_count
      `)
    )
    .orderBy('products.end_at', 'asc');
}

/**
 * Lấy tất cả sản phẩm mà bidder đã thắng (pending, sold, cancelled)
 * @param {number} bidderId - ID người đặt giá
 * @returns {Promise<Array>} Danh sách sản phẩm
 */
export async function getWonAuctionsByBidderId(bidderId) {
  return db('products')
    .leftJoin('categories', 'products.category_id', 'categories.id')
    .leftJoin('users as seller', 'products.seller_id', 'seller.id')
    .where('products.highest_bidder_id', bidderId)
    .where(function() {
      this.where(function() {
        // Pending: (end_at <= NOW OR closed_at) AND is_sold IS NULL
        this.where(function() {
          this.where('products.end_at', '<=', new Date())
            .orWhereNotNull('products.closed_at');
        }).whereNull('products.is_sold');
      })
      .orWhere('products.is_sold', true)   // Sold
      .orWhere('products.is_sold', false); // Cancelled
    })
    .select(
      'products.*',
      'categories.name as category_name',
      'seller.fullname as seller_name',
      'seller.email as seller_email',
      db.raw(`
        CASE
          WHEN products.is_sold IS TRUE THEN 'Sold'
          WHEN products.is_sold IS FALSE THEN 'Cancelled'
          WHEN (products.end_at <= NOW() OR products.closed_at IS NOT NULL) AND products.is_sold IS NULL THEN 'Pending'
        END AS status
      `),
      db.raw(`
        (
          SELECT COUNT(*) 
          FROM bidding_history 
          WHERE bidding_history.product_id = products.id
        ) AS bid_count
      `)
    )
    .orderBy('products.end_at', 'desc');
}
