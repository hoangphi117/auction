import * as productModel from '../models/product.model.js';
import * as reviewModel from '../models/review.model.js';
import * as categoryModel from '../models/category.model.js';
import * as systemSettingModel from '../models/systemSetting.model.js';
import * as productDescUpdateModel from '../models/productDescriptionUpdate.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import * as productCommentModel from '../models/productComment.model.js';
import * as rejectedBidderModel from '../models/rejectedBidder.model.js';
import { determineProductStatus } from '../utils/product-status.js';

export const prepareProductList = async (products) => {
	const now = new Date();
	if (!products) return [];

	const settings = await systemSettingModel.getSettings();
	const N_MINUTES = settings.new_product_limit_minutes;

	return products.map(product => {
		const created = new Date(product.created_at);
		const isNew = (now - created) < (N_MINUTES * 60 * 1000);

		return {
			...product,
			is_new: isNew
		};
	});
};

export const getCategoryProducts = async (categoryId, sort, userId) => {
	const category = await categoryModel.findByCategoryId(categoryId);

	let categoryIds = [categoryId];

	if (category && category.parent_id === null) {
		const childCategories = await categoryModel.findChildCategoryIds(categoryId);
		const childIds = childCategories.map(cat => cat.id);
		categoryIds = [categoryId, ...childIds];
	}

	return { category, categoryIds };
};

export const resolveProductDetailAccess = async (productId, product, userId) => {
	const now = new Date();
	const endDate = new Date(product.end_at);

	if (endDate <= now && !product.closed_at && product.is_sold === null) {
		await productModel.updateProduct(productId, { closed_at: endDate });
		product.closed_at = endDate;
	}

	const productStatus = determineProductStatus(product);

	if (productStatus === 'ACTIVE') {
		return { productStatus, canView: true };
	}

	if (!userId) {
		return { productStatus, canView: false };
	}

	const isSeller = product.seller_id === userId;
	const isHighestBidder = product.highest_bidder_id === userId;
	return { productStatus, canView: isSeller || isHighestBidder };
};

export const loadProductDetailData = async ({ productId, product, authUser, commentPage, productStatus, commentsPerPage = 2 }) => {
	const offset = (commentPage - 1) * commentsPerPage;

	const [descriptionUpdates, biddingHistory, comments, totalComments] = await Promise.all([
		productDescUpdateModel.findByProductId(productId),
		biddingHistoryModel.getBiddingHistory(productId),
		productCommentModel.getCommentsByProductId(productId, commentsPerPage, offset),
		productCommentModel.countCommentsByProductId(productId)
	]);

	if (comments.length > 0) {
		const commentIds = comments.map(c => c.id);
		const allReplies = await productCommentModel.getRepliesByCommentIds(commentIds);

		const repliesMap = new Map();
		for (const reply of allReplies) {
			if (!repliesMap.has(reply.parent_id)) {
				repliesMap.set(reply.parent_id, []);
			}
			repliesMap.get(reply.parent_id).push(reply);
		}

		for (const comment of comments) {
			comment.replies = repliesMap.get(comment.id) || [];
		}
	}

	const rejectedBidders = authUser && product.seller_id === authUser.id
		? await rejectedBidderModel.getRejectedBidders(productId)
		: [];

	const sellerRatingObject = await reviewModel.calculateRatingPoint(product.seller_id);
	const sellerReviews = await reviewModel.getReviewsByUserId(product.seller_id);

	let bidderRatingObject = { rating_point: null };
	let bidderReviews = [];
	if (product.highest_bidder_id) {
		bidderRatingObject = await reviewModel.calculateRatingPoint(product.highest_bidder_id);
		bidderReviews = await reviewModel.getReviewsByUserId(product.highest_bidder_id);
	}

	const showPaymentButton = !!authUser
		&& productStatus === 'PENDING'
		&& (product.seller_id === authUser.id || product.highest_bidder_id === authUser.id);

	return {
		descriptionUpdates,
		biddingHistory,
		comments,
		totalComments,
		totalPages: Math.ceil(totalComments / commentsPerPage),
		rejectedBidders,
		seller_rating_point: sellerRatingObject.rating_point,
		seller_has_reviews: sellerReviews.length > 0,
		bidder_rating_point: bidderRatingObject.rating_point,
		bidder_has_reviews: bidderReviews.length > 0,
		showPaymentButton
	};
};

export const getSellerRatings = async (sellerId) => {
	const seller = await productModel.findSellerById(sellerId);
	if (!seller) return null;

	const ratingData = await reviewModel.calculateRatingPoint(sellerId);
	const rating_point = ratingData ? ratingData.rating_point : 0;
	const reviews = await reviewModel.getReviewsByUserId(sellerId);

	const totalReviews = reviews.length;
	const positiveReviews = reviews.filter(r => r.rating === 1).length;
	const negativeReviews = reviews.filter(r => r.rating === -1).length;

	return {
		seller,
		rating_point,
		reviews,
		totalReviews,
		positiveReviews,
		negativeReviews
	};
};

export const getBidderRatings = async (bidderId) => {
	const bidder = await productModel.findBidderById(bidderId);
	if (!bidder) return null;

	const ratingData = await reviewModel.calculateRatingPoint(bidderId);
	const rating_point = ratingData ? ratingData.rating_point : 0;
	const reviews = await reviewModel.getReviewsByUserId(bidderId);

	const totalReviews = reviews.length;
	const positiveReviews = reviews.filter(r => r.rating === 1).length;
	const negativeReviews = reviews.filter(r => r.rating === -1).length;

	const maskedName = bidder.fullname ? bidder.fullname.split('').map((char, index) =>
		index % 2 === 0 ? char : '*'
	).join('') : '';

	return {
		bidder,
		maskedName,
		rating_point,
		reviews,
		totalReviews,
		positiveReviews,
		negativeReviews
	};
};
