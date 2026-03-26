import db from '../utils/db.js';

 // Khóa dòng product để cập nhật bid
export async function lockProductForBid(trx, productId) {
  const product = await trx('products')
    .where('id', productId)
    .forUpdate()
    .first();
  return product;
}

// Lưu kết quả đặt giá vào database trong transaction
export async function persistBidResult(trx, payload) {
  const {
    productId,
    newCurrentPrice,
    newHighestBidderId,
    newHighestMaxPrice,
    extendedEndTime,
    productSold,
    shouldCreateHistory,
    previousHighestBidderId
  } = payload;

  // 1. Update product với giá mới và người thắng
  const updateData = {
    current_price: newCurrentPrice,
    highest_bidder_id: newHighestBidderId,
    highest_max_price: newHighestMaxPrice
  };

  if (productSold) {
    updateData.end_at = new Date();
    updateData.closed_at = new Date();
  } else if (extendedEndTime) {
    updateData.end_at = extendedEndTime;
  }

  await trx('products')
    .where('id', productId)
    .update(updateData);

  // 2. Tạo history record nếu giá thay đổi
  if (shouldCreateHistory) {
    await trx('bidding_history').insert({
      product_id: productId,
      bidder_id: newHighestBidderId,
      current_price: newCurrentPrice
    });
  }

  return { success: true };
}

// Upsert auto_bidding record cho người dùng
export async function upsertAutoBid(trx, productId, userId, bidAmount) {
  await trx.raw(`
    INSERT INTO auto_bidding (product_id, bidder_id, max_price)
    VALUES (?, ?, ?)
    ON CONFLICT (product_id, bidder_id)
    DO UPDATE SET 
      max_price = EXCLUDED.max_price,
      created_at = NOW()
  `, [productId, userId, bidAmount]);
}

// Lấy thông tin sản phẩm cùng người đấu giá
export async function findByIdForUpdate(trx, productId) {
  return trx('products')
    .where('id', productId)
    .first();
}
