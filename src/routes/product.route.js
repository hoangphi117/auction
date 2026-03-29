import express from 'express';
import * as productModel from '../models/product.model.js';
import * as reviewModel from '../models/review.model.js';
import * as userModel from '../models/user.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import * as categoryModel from '../models/category.model.js';
import * as systemSettingModel from '../models/systemSetting.model.js';
import * as orderModel from '../models/order.model.js';
import * as bidModel from '../models/bid.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';
import { PaginationHelper } from '../utils/pagination.js';
import EmailService from '../services/EmailService.js';
import BidEngine from '../services/bid/BidEngine.js';
import BidValidationService from '../services/bid/BidValidationService.js';
import * as ProductService from '../services/ProductService.js';
import * as WatchlistService from '../services/WatchlistService.js';
import * as CommentService from '../services/CommentService.js';
import * as OrderService from '../services/OrderService.js';
import multer from 'multer';
import path from 'path';
import db from '../utils/db.js';

const router = express.Router();

// ==================== CATEGORY & SEARCH ROUTES ====================

router.get('/category', async (req, res) => {
	const userId = req.session.authUser ? req.session.authUser.id : null;
	const sort = req.query.sort || '';
	const categoryId = req.query.catid;

	const { category, categoryIds } = await ProductService.getCategoryProducts(categoryId, sort, userId);

	const result = await PaginationHelper.paginate(
		req,
		(limit, offset) => productModel.findByCategoryIds(categoryIds, limit, offset, sort, userId),
		() => productModel.countByCategoryIds(categoryIds)
	);

	const products = await ProductService.prepareProductList(result.items);

	res.render('vwProduct/list', {
		products: products,
		totalCount: result.totalCount,
		from: result.from,
		to: result.to,
		currentPage: result.currentPage,
		totalPages: result.totalPages,
		categoryId: categoryId,
		categoryName: category ? category.name : null,
		sort: sort,
	});
});

router.get('/search', async (req, res) => {
	const userId = req.session.authUser ? req.session.authUser.id : null;
	const q = req.query.q || '';
	const logic = req.query.logic || 'and';
	const sort = req.query.sort || '';

	if (q.length === 0) {
		return res.render('vwProduct/list', {
			q: q,
			logic: logic,
			sort: sort,
			products: [],
			totalCount: 0,
			from: 0,
			to: 0,
			currentPage: 1,
			totalPages: 0,
		});
	}

	const keywords = q.trim();

	const result = await PaginationHelper.paginate(
		req,
		(limit, offset) => productModel.searchPageByKeywords(keywords, limit, offset, userId, logic, sort),
		() => productModel.countByKeywords(keywords, logic)
	);

	const products = await ProductService.prepareProductList(result.items);

	res.render('vwProduct/list', {
		products: products,
		totalCount: result.totalCount,
		from: result.from,
		to: result.to,
		currentPage: result.currentPage,
		totalPages: result.totalPages,
		q: q,
		logic: logic,
		sort: sort,
	});
});

// ==================== PRODUCT DETAIL ROUTE ====================

router.get('/detail', async (req, res) => {
	const userId = req.session.authUser ? req.session.authUser.id : null;
	const productId = req.query.id;
	const product = await productModel.findByProductId2(productId, userId);
	const related_products = await productModel.findRelatedProducts(productId);

	if (!product) {
		return res.status(404).render('404', { message: 'Product not found' });
	}

	const access = await ProductService.resolveProductDetailAccess(productId, product, userId);
	if (!access.canView) {
		return res.status(403).render('403', { message: 'You do not have permission to view this product' });
	}

	const commentPage = parseInt(req.query.commentPage) || 1;
	const detailData = await ProductService.loadProductDetailData({
		productId,
		product,
		authUser: req.session.authUser,
		commentPage,
		productStatus: access.productStatus
	});

	const success_message = req.session.success_message;
	const error_message = req.session.error_message;
	delete req.session.success_message;
	delete req.session.error_message;

	res.render('vwProduct/details', {
		product,
		productStatus: access.productStatus,
		authUser: req.session.authUser,
		descriptionUpdates: detailData.descriptionUpdates,
		biddingHistory: detailData.biddingHistory,
		rejectedBidders: detailData.rejectedBidders,
		comments: detailData.comments,
		success_message,
		error_message,
		related_products,
		seller_rating_point: detailData.seller_rating_point,
		seller_has_reviews: detailData.seller_has_reviews,
		bidder_rating_point: detailData.bidder_rating_point,
		bidder_has_reviews: detailData.bidder_has_reviews,
		commentPage,
		totalPages: detailData.totalPages,
		totalComments: detailData.totalComments,
		showPaymentButton: detailData.showPaymentButton
	});
});

// ==================== BIDDING HISTORY ROUTE ====================

router.get('/bidding-history', isAuthenticated, async (req, res) => {
	const productId = req.query.id;

	if (!productId) {
		return res.redirect('/');
	}

	try {
		const product = await productModel.findByProductId2(productId, null);

		if (!product) {
			return res.status(404).render('404', { message: 'Product not found' });
		}

		const biddingHistory = await biddingHistoryModel.getBiddingHistory(productId);

		res.render('vwProduct/biddingHistory', {
			product,
			biddingHistory
		});
	} catch (error) {
		console.error('Error loading bidding history:', error);
		res.status(500).render('500', { message: 'Unable to load bidding history' });
	}
});

// ==================== WATCHLIST ROUTES ====================

router.post('/watchlist', isAuthenticated, async (req, res) => {
	const userId = req.session.authUser.id;
	const productId = req.body.productId;

	await WatchlistService.addToWatchlist(userId, productId);

	const retUrl = req.headers.referer || '/';
	res.redirect(retUrl);
});

router.delete('/watchlist', isAuthenticated, async (req, res) => {
	const userId = req.session.authUser.id;
	const productId = req.body.productId;

	await WatchlistService.removeFromWatchlist(userId, productId);

	const retUrl = req.headers.referer || '/';
	res.redirect(retUrl);
});

// ==================== BID ROUTE ====================

router.post('/bid', isAuthenticated, async (req, res) => {
	const userId = req.session.authUser.id;
	const productId = parseInt(req.body.productId);
	const bidAmount = parseFloat(req.body.bidAmount.replace(/,/g, ''));

	try {
		const result = await db.transaction(async (trx) => {
			const product = await bidModel.lockProductForBid(trx, productId);

			const previousHighestBidderId = product.highest_bidder_id;
			const previousPrice = parseFloat(product.current_price || product.starting_price);

			const now = new Date();
			await BidValidationService.validate(product, userId, bidAmount, now, trx);

			const userReviews = await reviewModel.getReviewsByUserId(userId);
			if (userReviews.length === 0 && !product.allow_unrated_bidder) {
				throw new Error('This seller does not allow unrated bidders to bid on this product.');
			}

			const settings = await systemSettingModel.getSettings();
			const bidResult = BidEngine.computeNextState(product, userId, bidAmount, settings, now);

			await bidModel.persistBidResult(trx, {
				productId,
				newCurrentPrice: bidResult.newCurrentPrice,
				newHighestBidderId: bidResult.newHighestBidderId,
				newHighestMaxPrice: bidResult.newHighestMaxPrice,
				extendedEndTime: bidResult.newEndTime,
				productSold: bidResult.productSold,
				shouldCreateHistory: bidResult.shouldCreateHistory,
				previousHighestBidderId
			});

			await bidModel.upsertAutoBid(trx, productId, userId, bidAmount);

			return {
				newCurrentPrice: bidResult.newCurrentPrice,
				newHighestBidderId: bidResult.newHighestBidderId,
				userId,
				bidAmount,
				productSold: bidResult.productSold,
				autoExtended: bidResult.autoExtended,
				newEndTime: bidResult.newEndTime,
				productName: product.name,
				sellerId: product.seller_id,
				previousHighestBidderId,
				previousPrice,
				priceChanged: bidResult.priceChanged
			};
		});

		// Send email notifications asynchronously
		const productUrl = `${req.protocol}://${req.get('host')}/products/detail?id=${productId}`;

		(async () => {
			try {
				const [seller, currentBidder, previousBidder] = await Promise.all([
					userModel.findById(result.sellerId),
					userModel.findById(result.userId),
					result.previousHighestBidderId && result.previousHighestBidderId !== result.userId
						? userModel.findById(result.previousHighestBidderId)
						: null
				]);

				const emailCount = await EmailService.sendBidNotifications({
					seller,
					currentBidder,
					previousBidder,
					productName: result.productName,
					newCurrentPrice: result.newCurrentPrice,
					previousPrice: result.previousPrice,
					bidAmount: result.bidAmount,
					newHighestBidderId: result.newHighestBidderId,
					userId: result.userId,
					previousHighestBidderId: result.previousHighestBidderId,
					priceChanged: result.priceChanged,
					productSold: result.productSold,
					productUrl
				});

				console.log(`${emailCount} bid notification email(s) sent for product #${productId}`);
			} catch (emailError) {
				console.error('Failed to send bid notification emails:', emailError);
			}
		})();

		let baseMessage = '';
		if (result.productSold) {
			if (result.newHighestBidderId === result.userId) {
				baseMessage = `Congratulations! You won the product with Buy Now price: ${result.newCurrentPrice.toLocaleString()} VND. Please proceed to payment.`;
			} else {
				baseMessage = `Product has been sold to another bidder at Buy Now price: ${result.newCurrentPrice.toLocaleString()} VND. Your bid helped reach the Buy Now threshold.`;
			}
		} else if (result.newHighestBidderId === result.userId) {
			baseMessage = `Bid placed successfully! Current price: ${result.newCurrentPrice.toLocaleString()} VND (Your max: ${result.bidAmount.toLocaleString()} VND)`;
		} else {
			baseMessage = `Bid placed! Another bidder is currently winning at ${result.newCurrentPrice.toLocaleString()} VND`;
		}

		if (result.autoExtended) {
			const extendedTimeStr = new Date(result.newEndTime).toLocaleString('vi-VN');
			baseMessage += ` | Auction extended to ${extendedTimeStr}`;
		}

		req.session.success_message = baseMessage;
		res.redirect(`/products/detail?id=${productId}`);

	} catch (error) {
		console.error('Bid error:', error);
		req.session.error_message = error.message || 'An error occurred while placing bid. Please try again.';
		res.redirect(`/products/detail?id=${productId}`);
	}
});

// ==================== COMMENT ROUTE ====================

router.post('/comment', isAuthenticated, async (req, res) => {
	const { productId, content, parentId } = req.body;
	const userId = req.session.authUser.id;

	try {
		await CommentService.createComment(productId, userId, content, parentId, req);
		req.session.success_message = 'Comment posted successfully!';
		res.redirect(`/products/detail?id=${productId}`);
	} catch (error) {
		console.error('Post comment error:', error);
		req.session.error_message = error.message || 'Failed to post comment. Please try again.';
		res.redirect(`/products/detail?id=${productId}`);
	}
});

// ==================== BID HISTORY API ====================

router.get('/bid-history/:productId', async (req, res) => {
	try {
		const productId = parseInt(req.params.productId);
		const history = await biddingHistoryModel.getBiddingHistory(productId);
		res.json({ success: true, data: history });
	} catch (error) {
		console.error('Get bid history error:', error);
		res.status(500).json({ success: false, message: 'Unable to load bidding history' });
	}
});

// ==================== COMPLETE ORDER ROUTE ====================

router.get('/complete-order', isAuthenticated, async (req, res) => {
	const userId = req.session.authUser.id;
	const productId = req.query.id;

	if (!productId) {
		return res.redirect('/');
	}

	const result = await OrderService.getOrderDetails(productId, userId);

	if (result.error === 'NOT_FOUND') {
		return res.status(404).render('404', { message: 'Product not found' });
	}

	if (result.error === 'NOT_PENDING') {
		return res.redirect(`/products/detail?id=${productId}`);
	}

	if (result.error === 'UNAUTHORIZED') {
		return res.status(403).render('403', { message: 'You do not have permission to access this page' });
	}

	res.render('vwProduct/complete-order', {
		product: result.product,
		order: result.order,
		paymentInvoice: result.paymentInvoice,
		shippingInvoice: result.shippingInvoice,
		messages: result.messages,
		isSeller: result.isSeller,
		isHighestBidder: result.isHighestBidder,
		currentUserId: userId
	});
});

// ==================== IMAGE UPLOAD ====================

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'public/uploads/');
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
		cb(null, uniqueSuffix + '-' + file.originalname);
	}
});

const upload = multer({
	storage: storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: function (req, file, cb) {
		const allowedTypes = /jpeg|jpg|png|gif/;
		const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
		const mimetype = allowedTypes.test(file.mimetype);

		if (mimetype && extname) {
			return cb(null, true);
		} else {
			cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, gif)!'));
		}
	}
});

router.post('/order/upload-images', isAuthenticated, upload.array('images', 5), async (req, res) => {
	try {
		if (!req.files || req.files.length === 0) {
			return res.status(400).json({ error: 'No files uploaded' });
		}

		const urls = req.files.map(file => `uploads/${file.filename}`);
		res.json({ success: true, urls });
	} catch (error) {
		console.error('Upload error:', error);
		res.status(500).json({ error: error.message || 'Upload failed' });
	}
});

// ==================== ORDER ROUTES ====================

router.post('/order/:orderId/submit-payment', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;
		const { payment_method, payment_proof_urls, note, shipping_address, shipping_phone } = req.body;

		const result = await OrderService.submitPayment(orderId, userId, {
			payment_method,
			payment_proof_urls,
			note,
			shipping_address,
			shipping_phone
		});

		if (result.error) {
			return res.status(403).json({ error: result.error });
		}

		res.json({ success: true, message: 'Payment submitted successfully' });
	} catch (error) {
		console.error('Submit payment error:', error);
		res.status(500).json({ error: error.message || 'Failed to submit payment' });
	}
});

router.post('/order/:orderId/confirm-payment', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;

		const result = await OrderService.confirmPayment(orderId, userId);

		if (result.error) {
			return res.status(result.error === 'UNAUTHORIZED' ? 403 : 400).json({ error: result.error });
		}

		res.json({ success: true, message: 'Payment confirmed successfully' });
	} catch (error) {
		console.error('Confirm payment error:', error);
		res.status(500).json({ error: error.message || 'Failed to confirm payment' });
	}
});

router.post('/order/:orderId/submit-shipping', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;
		const { tracking_number, shipping_provider, shipping_proof_urls, note } = req.body;

		const result = await OrderService.submitShipping(orderId, userId, {
			tracking_number,
			shipping_provider,
			shipping_proof_urls,
			note
		});

		if (result.error) {
			return res.status(403).json({ error: result.error });
		}

		res.json({ success: true, message: 'Shipping info submitted successfully' });
	} catch (error) {
		console.error('Submit shipping error:', error);
		res.status(500).json({ error: error.message || 'Failed to submit shipping' });
	}
});

router.post('/order/:orderId/confirm-delivery', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;

		const result = await OrderService.confirmDelivery(orderId, userId);

		if (result.error) {
			return res.status(403).json({ error: result.error });
		}

		res.json({ success: true, message: 'Delivery confirmed successfully' });
	} catch (error) {
		console.error('Confirm delivery error:', error);
		res.status(500).json({ error: error.message || 'Failed to confirm delivery' });
	}
});

router.post('/order/:orderId/submit-rating', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;
		const { rating, comment } = req.body;

		const result = await OrderService.submitRating(orderId, userId, { rating, comment });

		if (result.error) {
			return res.status(403).json({ error: result.error });
		}

		res.json({ success: true, message: 'Rating submitted successfully' });
	} catch (error) {
		console.error('Submit rating error:', error);
		res.status(500).json({ error: error.message || 'Failed to submit rating' });
	}
});

router.post('/order/:orderId/complete-transaction', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;

		const result = await OrderService.completeTransaction(orderId, userId);

		if (result.error) {
			return res.status(403).json({ error: result.error });
		}

		res.json({ success: true, message: 'Transaction completed' });
	} catch (error) {
		console.error('Complete transaction error:', error);
		res.status(500).json({ error: error.message || 'Failed to complete transaction' });
	}
});

router.post('/order/:orderId/send-message', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;
		const { message } = req.body;

		const result = await OrderService.sendMessage(orderId, userId, message);

		if (result.error) {
			return res.status(403).json({ error: result.error });
		}

		res.json({ success: true, message: 'Message sent successfully' });
	} catch (error) {
		console.error('Send message error:', error);
		res.status(500).json({ error: error.message || 'Failed to send message' });
	}
});

router.get('/order/:orderId/messages', isAuthenticated, async (req, res) => {
	try {
		const orderId = req.params.orderId;
		const userId = req.session.authUser.id;

		const result = await OrderService.getMessages(orderId, userId);

		if (result.error) {
			return res.status(403).json({ error: result.error });
		}

		const messagesHtml = OrderService.formatMessagesHtml(result.messages, userId);
		res.json({ success: true, messagesHtml });
	} catch (error) {
		console.error('Get messages error:', error);
		res.status(500).json({ error: error.message || 'Failed to get messages' });
	}
});

// ==================== REJECT BIDDER ROUTE ====================

router.post('/reject-bidder', isAuthenticated, async (req, res) => {
	const { productId, bidderId } = req.body;
	const sellerId = req.session.authUser.id;

	try {
		let rejectedBidderInfo = null;
		let productInfo = null;
		let sellerInfo = null;

		await db.transaction(async (trx) => {
			const product = await trx('products')
				.where('id', productId)
				.forUpdate()
				.first();

			if (!product) {
				throw new Error('Product not found');
			}

			if (product.seller_id !== sellerId) {
				throw new Error('Only the seller can reject bidders');
			}

			const now = new Date();
			const endDate = new Date(product.end_at);

			if (product.is_sold !== null || endDate <= now || product.closed_at) {
				throw new Error('Can only reject bidders for active auctions');
			}

			const autoBid = await trx('auto_bidding')
				.where('product_id', productId)
				.where('bidder_id', bidderId)
				.first();

			if (!autoBid) {
				throw new Error('This bidder has not placed a bid on this product');
			}

			rejectedBidderInfo = await trx('users')
				.where('id', bidderId)
				.first();

			productInfo = product;
			sellerInfo = await trx('users')
				.where('id', sellerId)
				.first();

			await trx('rejected_bidders').insert({
				product_id: productId,
				bidder_id: bidderId,
				seller_id: sellerId
			}).onConflict(['product_id', 'bidder_id']).ignore();

			await trx('bidding_history')
				.where('product_id', productId)
				.where('bidder_id', bidderId)
				.del();

			await trx('auto_bidding')
				.where('product_id', productId)
				.where('bidder_id', bidderId)
				.del();

			const allAutoBids = await trx('auto_bidding')
				.where('product_id', productId)
				.orderBy('max_price', 'desc');

			const bidderIdNum = parseInt(bidderId);
			const highestBidderIdNum = parseInt(product.highest_bidder_id);
			const wasHighestBidder = (highestBidderIdNum === bidderIdNum);

			if (allAutoBids.length === 0) {
				await trx('products')
					.where('id', productId)
					.update({
						highest_bidder_id: null,
						current_price: product.starting_price,
						highest_max_price: null
					});
			} else if (allAutoBids.length === 1) {
				const winner = allAutoBids[0];
				const newPrice = product.starting_price;

				await trx('products')
					.where('id', productId)
					.update({
						highest_bidder_id: winner.bidder_id,
						current_price: newPrice,
						highest_max_price: winner.max_price
					});

				if (wasHighestBidder || product.current_price !== newPrice) {
					await trx('bidding_history').insert({
						product_id: productId,
						bidder_id: winner.bidder_id,
						current_price: newPrice
					});
				}
			} else if (wasHighestBidder) {
				const firstBidder = allAutoBids[0];
				const secondBidder = allAutoBids[1];

				let newPrice = secondBidder.max_price + product.step_price;

				if (newPrice > firstBidder.max_price) {
					newPrice = firstBidder.max_price;
				}

				await trx('products')
					.where('id', productId)
					.update({
						highest_bidder_id: firstBidder.bidder_id,
						current_price: newPrice,
						highest_max_price: firstBidder.max_price
					});

				const lastHistory = await trx('bidding_history')
					.where('product_id', productId)
					.orderBy('created_at', 'desc')
					.first();

				if (!lastHistory || lastHistory.current_price !== newPrice) {
					await trx('bidding_history').insert({
						product_id: productId,
						bidder_id: firstBidder.bidder_id,
						current_price: newPrice
					});
				}
			}
		});

		if (rejectedBidderInfo && rejectedBidderInfo.email && productInfo) {
			EmailService.sendBidRejectedNotification(rejectedBidderInfo, {
				productName: productInfo.name,
				sellerName: sellerInfo ? sellerInfo.fullname : null,
				homeUrl: `${req.protocol}://${req.get('host')}/`
			}).then(() => {
				console.log(`Rejection email sent to ${rejectedBidderInfo.email} for product #${productId}`);
			}).catch((emailError) => {
				console.error('Failed to send rejection email:', emailError);
			});
		}

		res.json({ success: true, message: 'Bidder rejected successfully' });
	} catch (error) {
		console.error('Error rejecting bidder:', error);
		res.status(400).json({
			success: false,
			message: error.message || 'Failed to reject bidder'
		});
	}
});

// ==================== UNREJECT BIDDER ROUTE ====================

router.post('/unreject-bidder', isAuthenticated, async (req, res) => {
	const { productId, bidderId } = req.body;
	const sellerId = req.session.authUser.id;

	try {
		const product = await productModel.findByProductId2(productId, sellerId);

		if (!product) {
			throw new Error('Product not found');
		}

		if (product.seller_id !== sellerId) {
			throw new Error('Only the seller can unreject bidders');
		}

		const now = new Date();
		const endDate = new Date(product.end_at);

		if (product.is_sold !== null || endDate <= now || product.closed_at) {
			throw new Error('Can only unreject bidders for active auctions');
		}

		await db('rejected_bidders')
			.where({ product_id: productId, bidder_id: bidderId })
			.del();

		res.json({ success: true, message: 'Bidder can now bid on this product again' });
	} catch (error) {
		console.error('Error unrejecting bidder:', error);
		res.status(400).json({
			success: false,
			message: error.message || 'Failed to unreject bidder'
		});
	}
});

// ==================== BUY NOW ROUTE ====================

router.post('/buy-now', isAuthenticated, async (req, res) => {
	const { productId } = req.body;
	const userId = req.session.authUser.id;

	try {
		await db.transaction(async (trx) => {
			const product = await trx('products')
				.leftJoin('users as seller', 'products.seller_id', 'seller.id')
				.where('products.id', productId)
				.select('products.*', 'seller.fullname as seller_name')
				.first();

			if (!product) {
				throw new Error('Product not found');
			}

			if (product.seller_id === userId) {
				throw new Error('Seller cannot buy their own product');
			}

			const now = new Date();
			const endDate = new Date(product.end_at);

			if (product.is_sold !== null) {
				throw new Error('Product is no longer available');
			}

			if (endDate <= now || product.closed_at) {
				throw new Error('Auction has already ended');
			}

			if (!product.buy_now_price) {
				throw new Error('Buy Now option is not available for this product');
			}

			const buyNowPrice = parseFloat(product.buy_now_price);

			const isRejected = await trx('rejected_bidders')
				.where({ product_id: productId, bidder_id: userId })
				.first();

			if (isRejected) {
				throw new Error('You have been rejected from bidding on this product');
			}

			if (!product.allow_unrated_bidder) {
				const bidder = await trx('users').where('id', userId).first();
				const ratingData = await reviewModel.calculateRatingPoint(userId);
				const ratingPoint = ratingData ? ratingData.rating_point : 0;

				if (ratingPoint === 0) {
					throw new Error('This product does not allow bidders without ratings');
				}
			}

			await trx('products')
				.where('id', productId)
				.update({
					current_price: buyNowPrice,
					highest_bidder_id: userId,
					highest_max_price: buyNowPrice,
					end_at: now,
					closed_at: now,
					is_buy_now_purchase: true
				});

			await trx('bidding_history').insert({
				product_id: productId,
				bidder_id: userId,
				current_price: buyNowPrice,
				is_buy_now: true
			});
		});

		res.json({
			success: true,
			message: 'Congratulations! You have successfully purchased the product at Buy Now price. Please proceed to payment.',
			redirectUrl: `/products/complete-order?id=${productId}`
		});

	} catch (error) {
		console.error('Buy Now error:', error);
		res.status(400).json({
			success: false,
			message: error.message || 'Failed to purchase product'
		});
	}
});

// ==================== SELLER & BIDDER RATINGS ====================

router.get('/seller/:sellerId/ratings', async (req, res) => {
	try {
		const sellerId = parseInt(req.params.sellerId);

		if (!sellerId) {
			return res.redirect('/');
		}

		const result = await ProductService.getSellerRatings(sellerId);

		if (!result) {
			return res.redirect('/');
		}

		res.render('vwProduct/seller-ratings', {
			sellerName: result.seller.fullname,
			rating_point: result.rating_point,
			totalReviews: result.totalReviews,
			positiveReviews: result.positiveReviews,
			negativeReviews: result.negativeReviews,
			reviews: result.reviews
		});

	} catch (error) {
		console.error('Error loading seller ratings page:', error);
		res.redirect('/');
	}
});

router.get('/bidder/:bidderId/ratings', async (req, res) => {
	try {
		const bidderId = parseInt(req.params.bidderId);

		if (!bidderId) {
			return res.redirect('/');
		}

		const result = await ProductService.getBidderRatings(bidderId);

		if (!result) {
			return res.redirect('/');
		}

		res.render('vwProduct/bidder-ratings', {
			bidderName: result.maskedName,
			rating_point: result.rating_point,
			totalReviews: result.totalReviews,
			positiveReviews: result.positiveReviews,
			negativeReviews: result.negativeReviews,
			reviews: result.reviews
		});

	} catch (error) {
		console.error('Error loading bidder ratings page:', error);
		res.redirect('/');
	}
});

export default router;