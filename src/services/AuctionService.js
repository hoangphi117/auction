import * as reviewModel from '../models/review.model.js';
import * as autoBiddingModel from '../models/autoBidding.model.js';

export async function getRatings(userId) {
  const ratingData = await reviewModel.calculateRatingPoint(userId);
  const rating_point = ratingData ? ratingData.rating_point : 0;

  const reviews = await reviewModel.getReviewsByUserId(userId);

  const totalReviews = reviews.length;
  const positiveReviews = reviews.filter(r => r.rating === 1).length;
  const negativeReviews = reviews.filter(r => r.rating === -1).length;

  return {
    rating_point,
    reviews,
    totalReviews,
    positiveReviews,
    negativeReviews
  };
}

export async function getBiddingProducts(userId) {
  return await autoBiddingModel.getBiddingProductsByBidderId(userId);
}

export async function getWonAuctions(userId) {
  const wonAuctions = await autoBiddingModel.getWonAuctionsByBidderId(userId);

  for (let product of wonAuctions) {
    const review = await reviewModel.findByReviewerAndProduct(userId, product.id);

    if (review && review.rating !== 0) {
      product.has_rated_seller = true;
      product.seller_rating = review.rating === 1 ? 'positive' : 'negative';
      product.seller_rating_comment = review.comment;
    } else {
      product.has_rated_seller = false;
    }
  }

  return wonAuctions;
}

export async function rateSeller(userId, productId, data) {
  const ratingValue = data.rating === 'positive' ? 1 : -1;

  const existingReview = await reviewModel.findByReviewerAndProduct(userId, productId);

  if (existingReview) {
    await reviewModel.updateByReviewerAndProduct(userId, productId, {
      rating: ratingValue,
      comment: data.comment || null
    });
  } else {
    await reviewModel.create({
      reviewer_id: userId,
      reviewed_user_id: data.seller_id,
      product_id: productId,
      rating: ratingValue,
      comment: data.comment || null
    });
  }
}