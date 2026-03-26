/**
 * BidEngine: Tính toán logic auto-bidding theo quy tắc nghiệp vụ
 * Không phụ thuộc DB, chỉ làm việc với pure data
 */

class BidEngine {
    
// Tính toán trạng thái tiếp theo sau khi có bid mới
  static computeNextState(product, userId, bidAmount, settings, now) {
    const minIncrement = parseFloat(product.step_price);
    const buyNowPrice = product.buy_now_price ? parseFloat(product.buy_now_price) : null;
    const endDate = new Date(product.end_at);
    const currentPrice = parseFloat(product.current_price || product.starting_price);
    const currentHighestMaxPrice = product.highest_max_price ? parseFloat(product.highest_max_price) : null;

    let newCurrentPrice;
    let newHighestBidderId;
    let newHighestMaxPrice;
    let shouldCreateHistory = true;
    let productSold = false;
    let extendedEndTime = null;

    // ===== AUTO-EXTEND LOGIC =====
    if (product.auto_extend) {
      const triggerMinutes = settings?.auto_extend_trigger_minutes || 5;
      const extendMinutes = settings?.auto_extend_duration_minutes || 5;
      const minutesRemaining = (endDate - now) / (1000 * 60);

      if (minutesRemaining <= triggerMinutes) {
        extendedEndTime = new Date(endDate.getTime() + extendMinutes * 60 * 1000);
      }
    }

    // ===== BUY-NOW CHECK (First-come-first-served) =====
    // Nếu người thứ hai đặt giá, và người thứ nhất có max >= buy_now, người thứ nhất thắng ngay
    if (buyNowPrice && product.highest_bidder_id && product.highest_bidder_id !== userId) {
      if (currentHighestMaxPrice >= buyNowPrice) {
        newCurrentPrice = buyNowPrice;
        newHighestBidderId = product.highest_bidder_id;
        newHighestMaxPrice = currentHighestMaxPrice;
        productSold = true;
        // New bidder's auto bid vẫn được lưu, nhưng họ không thắng
        return {
          newCurrentPrice,
          newHighestBidderId,
          newHighestMaxPrice,
          productSold,
          autoExtended: false,
          newEndTime: null,
          shouldCreateHistory: false,
          priceChanged: true
        };
      }
    }

    // ===== NORMAL AUCTION LOGIC =====
    // Case 0: Người đặt giá là người có giá cao nhất hiện tại
    if (product.highest_bidder_id === userId) {
      newCurrentPrice = currentPrice;
      newHighestBidderId = userId;
      newHighestMaxPrice = bidAmount; // Chỉ update max price
      shouldCreateHistory = false; // Giá không thay đổi
    }
    // Case 1: Chưa có ai đặt giá (bid đầu tiên)
    else if (!product.highest_bidder_id) {
      newCurrentPrice = product.starting_price;
      newHighestBidderId = userId;
      newHighestMaxPrice = bidAmount;
    }
    // Case 2: Đã có người đặt giá trước đó
    else {
      // Case 2a: bidAmount < max price của người cũ
      if (bidAmount < currentHighestMaxPrice) {
        newCurrentPrice = bidAmount;
        newHighestBidderId = product.highest_bidder_id;
        newHighestMaxPrice = currentHighestMaxPrice;
      }
      // Case 2b: bidAmount == max price của người cũ
      else if (bidAmount === currentHighestMaxPrice) {
        newCurrentPrice = bidAmount;
        newHighestBidderId = product.highest_bidder_id; // First-come-first-served
        newHighestMaxPrice = currentHighestMaxPrice;
      }
      // Case 2c: bidAmount > max price của người cũ
      else {
        newCurrentPrice = currentHighestMaxPrice + minIncrement;
        newHighestBidderId = userId;
        newHighestMaxPrice = bidAmount;
      }
    }

    // ===== BUY-NOW CHECK AFTER AUTO-BIDDING =====
    if (buyNowPrice && newCurrentPrice >= buyNowPrice) {
      newCurrentPrice = buyNowPrice;
      productSold = true;
    }

    return {
      newCurrentPrice,
      newHighestBidderId,
      newHighestMaxPrice,
      productSold,
      autoExtended: !!extendedEndTime,
      newEndTime: extendedEndTime,
      shouldCreateHistory,
      priceChanged: currentPrice !== newCurrentPrice
    };
  }
}

export default BidEngine;
