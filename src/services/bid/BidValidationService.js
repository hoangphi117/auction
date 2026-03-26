import * as reviewModel from '../../models/review.model.js';
import * as rejectedBidderModel from '../../models/rejectedBidder.model.js';

class BidValidationService {

//Validate tất cả điều kiện trước khi cho phép đặt giá
  static async validate(product, userId, bidAmount, now, trx = null) {
    // Các validation ko phụ thuộc DB
    this.validateProductExists(product);
    this.validateNotSold(product);
    this.validateNotSeller(product, userId);
    this.validateAuctionTime(product, now);
    this.validateBidAmount(product, bidAmount);

    // Các validation cần DB access
    await this.validateNotRejectedBidder(userId, product.id, trx);
    await this.validateBidderRating(userId);
  }

  /**
   * Kiểm tra sản phẩm có tồn tại không 
   */
  static validateProductExists(product) {
    if (!product) {
      throw new Error('Product not found');
    }
  }

  /**
   * Kiểm tra sản phẩm đã bán hay bị hủy
   */
  static validateNotSold(product) {
    if (product.is_sold === true) {
      throw new Error('This product has already been sold');
    }
    if (product.is_sold === false) {
      throw new Error('This product is cancelled and cannot be bid on');
    }
  }

  /**
   * Kiểm tra người đặt giá không phải chủ sản phẩm
   */
  static validateNotSeller(product, userId) {
    if (product.seller_id === userId) {
      throw new Error('You cannot bid on your own product');
    }
  }

  /**
   * Kiểm tra đấu giá còn thời gian không
   */
  static validateAuctionTime(product, now) {
    const endDate = new Date(product.end_at);
    if (now > endDate) {
      throw new Error('Auction has ended');
    }
  }

  /**
   * Kiểm tra giá đặt có hợp lệ không (> current_price, >= min_increment, v.v.)
   */
  static validateBidAmount(product, bidAmount) {
    const currentPrice = parseFloat(product.current_price || product.starting_price);
    const minIncrement = parseFloat(product.step_price);

    if (bidAmount <= currentPrice) {
      throw new Error(
        `Bid must be higher than current price (${currentPrice.toLocaleString()} VND)`
      );
    }

    if (bidAmount < currentPrice + minIncrement) {
      throw new Error(
        `Bid must be at least ${minIncrement.toLocaleString()} VND higher than current price`
      );
    }
  }

  /**
   * Kiểm tra người dùng có bị reject khỏi đấu giá sản phẩm này không
   * Cần transaction vì được gọi từ trong transaction
   */
  static async validateNotRejectedBidder(userId, productId, trx = null) {
    // Nếu có trx, dùng nó; nếu không thì dùng hàm model bình thường
    const isRejected = trx
      ? await trx('rejected_bidders')
          .where('product_id', productId)
          .where('bidder_id', userId)
          .first()
      : await rejectedBidderModel.getRejectedBidder(productId, userId);

    if (isRejected) {
      throw new Error(
        'You have been rejected from bidding on this product by the seller'
      );
    }
  }

  /**
   * Kiểm tra rating của người dùng (nếu có review)
   */
  static async validateBidderRating(userId) {
    const ratingPoint = await reviewModel.calculateRatingPoint(userId);
    const userReviews = await reviewModel.getReviewsByUserId(userId);
    const hasReviews = userReviews.length > 0;

    if (!hasReviews) {
      // Nếu chưa có review, là unrated user
      // Chỉ check nếu seller cho phép (validateBidderAllowed check ở route cũ)
      return; // Skip nếu bên route đã check allow_unrated_bidder
    }

    if (ratingPoint.rating_point < 0) {
      throw new Error('You are not eligible to place bids due to your rating.');
    }

    if (ratingPoint.rating_point === 0) {
      throw new Error('You are not eligible to place bids due to your rating.');
    }

    if (ratingPoint.rating_point <= 0.8) {
      throw new Error('Your rating point is not greater than 80%. You cannot place bids.');
    }
  }
}

export default BidValidationService;
