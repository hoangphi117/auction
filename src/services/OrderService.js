import * as orderModel from '../models/order.model.js';
import * as invoiceModel from '../models/invoice.model.js';
import * as orderChatModel from '../models/orderChat.model.js';
import * as reviewModel from '../models/review.model.js';
import * as productModel from '../models/product.model.js';
import { determineProductStatus } from '../utils/product-status.js';
import db from '../utils/db.js';

export const getOrderDetails = async (productId, userId) => {
	const product = await productModel.findByProductId2(productId, userId);

	if (!product) {
		return { error: 'NOT_FOUND' };
	}

	const productStatus = determineProductStatus(product);

	if (productStatus !== 'PENDING') {
		return { error: 'NOT_PENDING' };
	}

	const isSeller = product.seller_id === userId;
	const isHighestBidder = product.highest_bidder_id === userId;

	if (!isSeller && !isHighestBidder) {
		return { error: 'UNAUTHORIZED' };
	}

	let order = await orderModel.findByProductId(productId);

	if (!order) {
		const orderData = {
			product_id: productId,
			buyer_id: product.highest_bidder_id,
			seller_id: product.seller_id,
			final_price: product.current_price || product.highest_bid || 0
		};
		await orderModel.createOrder(orderData);
		order = await orderModel.findByProductId(productId);
	}

	let paymentInvoice = await invoiceModel.getPaymentInvoice(order.id);
	let shippingInvoice = await invoiceModel.getShippingInvoice(order.id);

	if (paymentInvoice && paymentInvoice.payment_proof_urls) {
		if (typeof paymentInvoice.payment_proof_urls === 'string') {
			paymentInvoice.payment_proof_urls = paymentInvoice.payment_proof_urls
				.replace(/^\{/, '')
				.replace(/\}$/, '')
				.split(',')
				.filter(url => url);
		}
	}

	if (shippingInvoice && shippingInvoice.shipping_proof_urls) {
		if (typeof shippingInvoice.shipping_proof_urls === 'string') {
			shippingInvoice.shipping_proof_urls = shippingInvoice.shipping_proof_urls
				.replace(/^\{/, '')
				.replace(/\}$/, '')
				.split(',')
				.filter(url => url);
		}
	}

	const messages = await orderChatModel.getMessagesByOrderId(order.id);

	return {
		product,
		order,
		paymentInvoice,
		shippingInvoice,
		messages,
		isSeller,
		isHighestBidder
	};
};

export const submitPayment = async (orderId, userId, data) => {
	const order = await orderModel.findById(orderId);
	if (!order || order.buyer_id !== userId) {
		return { error: 'UNAUTHORIZED' };
	}

	await invoiceModel.createPaymentInvoice({
		order_id: orderId,
		issuer_id: userId,
		payment_method: data.payment_method,
		payment_proof_urls: data.payment_proof_urls,
		note: data.note
	});

	await orderModel.updateShippingInfo(orderId, {
		shipping_address: data.shipping_address,
		shipping_phone: data.shipping_phone
	});

	await orderModel.updateStatus(orderId, 'payment_submitted', userId);

	return { success: true };
};

export const confirmPayment = async (orderId, userId) => {
	const order = await orderModel.findById(orderId);
	if (!order || order.seller_id !== userId) {
		return { error: 'UNAUTHORIZED' };
	}

	const paymentInvoice = await invoiceModel.getPaymentInvoice(orderId);
	if (!paymentInvoice) {
		return { error: 'NO_INVOICE' };
	}

	await invoiceModel.verifyInvoice(paymentInvoice.id);
	await orderModel.updateStatus(orderId, 'payment_confirmed', userId);

	return { success: true };
};

export const submitShipping = async (orderId, userId, data) => {
	const order = await orderModel.findById(orderId);
	if (!order || order.seller_id !== userId) {
		return { error: 'UNAUTHORIZED' };
	}

	await invoiceModel.createShippingInvoice({
		order_id: orderId,
		issuer_id: userId,
		tracking_number: data.tracking_number,
		shipping_provider: data.shipping_provider,
		shipping_proof_urls: data.shipping_proof_urls,
		note: data.note
	});

	await orderModel.updateStatus(orderId, 'shipped', userId);

	return { success: true };
};

export const confirmDelivery = async (orderId, userId) => {
	const order = await orderModel.findById(orderId);
	if (!order || order.buyer_id !== userId) {
		return { error: 'UNAUTHORIZED' };
	}

	await orderModel.updateStatus(orderId, 'delivered', userId);

	return { success: true };
};

export const submitRating = async (orderId, userId, data) => {
	const order = await orderModel.findById(orderId);
	if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
		return { error: 'UNAUTHORIZED' };
	}

	const isBuyer = order.buyer_id === userId;
	const reviewerId = userId;
	const revieweeId = isBuyer ? order.seller_id : order.buyer_id;
	const ratingValue = data.rating === 'positive' ? 1 : -1;

	const existingReview = await reviewModel.findByReviewerAndProduct(reviewerId, order.product_id);

	if (existingReview) {
		await reviewModel.updateByReviewerAndProduct(reviewerId, order.product_id, {
			rating: ratingValue,
			comment: data.comment || null
		});
	} else {
		await reviewModel.create({
			reviewer_id: reviewerId,
			reviewed_user_id: revieweeId,
			product_id: order.product_id,
			rating: ratingValue,
			comment: data.comment || null
		});
	}

	const buyerReview = await reviewModel.getProductReview(order.buyer_id, order.seller_id, order.product_id);
	const sellerReview = await reviewModel.getProductReview(order.seller_id, order.buyer_id, order.product_id);

	if (buyerReview && sellerReview) {
		await orderModel.updateStatus(orderId, 'completed', userId);
		await db('products').where('id', order.product_id).update({
			is_sold: true,
			closed_at: new Date()
		});
	}

	return { success: true };
};

export const completeTransaction = async (orderId, userId) => {
	const order = await orderModel.findById(orderId);
	if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
		return { error: 'UNAUTHORIZED' };
	}

	const isBuyer = order.buyer_id === userId;
	const reviewerId = userId;
	const revieweeId = isBuyer ? order.seller_id : order.buyer_id;

	const existingReview = await reviewModel.findByReviewerAndProduct(reviewerId, order.product_id);

	if (!existingReview) {
		await reviewModel.create({
			reviewer_id: reviewerId,
			reviewed_user_id: revieweeId,
			product_id: order.product_id,
			rating: 0,
			comment: null
		});
	}

	const buyerReview = await reviewModel.getProductReview(order.buyer_id, order.seller_id, order.product_id);
	const sellerReview = await reviewModel.getProductReview(order.seller_id, order.buyer_id, order.product_id);

	if (buyerReview && sellerReview) {
		await orderModel.updateStatus(orderId, 'completed', userId);
		await db('products').where('id', order.product_id).update({
			is_sold: true,
			closed_at: new Date()
		});
	}

	return { success: true };
};

export const sendMessage = async (orderId, userId, message) => {
	const order = await orderModel.findById(orderId);
	if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
		return { error: 'UNAUTHORIZED' };
	}

	await orderChatModel.sendMessage({
		order_id: orderId,
		sender_id: userId,
		message
	});

	return { success: true };
};

export const getMessages = async (orderId, userId) => {
	const order = await orderModel.findById(orderId);
	if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
		return { error: 'UNAUTHORIZED' };
	}

	const messages = await orderChatModel.getMessagesByOrderId(orderId);

	return { success: true, messages };
};

export const formatMessagesHtml = (messages, userId) => {
	let messagesHtml = '';
	messages.forEach(msg => {
		const isSent = msg.sender_id === userId;
		const messageClass = isSent ? 'text-end' : '';
		const bubbleClass = isSent ? 'sent' : 'received';

		const msgDate = new Date(msg.created_at);
		const year = msgDate.getFullYear();
		const month = String(msgDate.getMonth() + 1).padStart(2, '0');
		const day = String(msgDate.getDate()).padStart(2, '0');
		const hour = String(msgDate.getHours()).padStart(2, '0');
		const minute = String(msgDate.getMinutes()).padStart(2, '0');
		const second = String(msgDate.getSeconds()).padStart(2, '0');
		const formattedDate = `${hour}:${minute}:${second} ${day}/${month}/${year}`;

		messagesHtml += `
			<div class="chat-message ${messageClass}">
				<div class="chat-bubble ${bubbleClass}">
					<div>${msg.message}</div>
					<div style="font-size: 0.7rem; margin-top: 3px; opacity: 0.8;">${formattedDate}</div>
				</div>
			</div>
		`;
	});

	return messagesHtml;
};