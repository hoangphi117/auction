import * as productCommentModel from '../models/productComment.model.js';
import * as productModel from '../models/product.model.js';
import * as userModel from '../models/user.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import EmailService from './EmailService.js';

export const createComment = async (productId, userId, content, parentId, req) => {
	if (!content || content.trim().length === 0) {
		throw new Error('Comment cannot be empty');
	}

	await productCommentModel.createComment(productId, userId, content.trim(), parentId || null);

	const product = await productModel.findByProductId2(productId, null);
	const commenter = await userModel.findById(userId);
	const seller = await userModel.findById(product.seller_id);
	const productUrl = `${req.protocol}://${req.get('host')}/products/detail?id=${productId}`;

	const isSellerReplying = userId === product.seller_id;

	if (isSellerReplying && parentId) {
		const bidders = await biddingHistoryModel.getUniqueBidders(productId);
		const commenters = await productCommentModel.getUniqueCommenters(productId);

		const recipientsMap = new Map();

		bidders.forEach(b => {
			if (b.id !== product.seller_id && b.email) {
				recipientsMap.set(b.id, { email: b.email, fullname: b.fullname });
			}
		});

		commenters.forEach(c => {
			if (c.id !== product.seller_id && c.email) {
				recipientsMap.set(c.id, { email: c.email, fullname: c.fullname });
			}
		});

		for (const [recipientId, recipient] of recipientsMap) {
			try {
				await EmailService.sendSellerReplyNotification(recipient, {
					productName: product.name,
					sellerName: seller.fullname,
					answer: content,
					productUrl
				});
			} catch (emailError) {
				console.error(`Failed to send email to ${recipient.email}:`, emailError);
			}
		}
	} else if (seller && seller.email && userId !== product.seller_id) {
		if (parentId) {
			await EmailService.sendCommentNotificationToSeller(seller, {
				productName: product.name,
				commenterName: commenter.fullname,
				contentText: content,
				productUrl,
				isReply: true
			});
		} else {
			await EmailService.sendCommentNotificationToSeller(seller, {
				productName: product.name,
				commenterName: commenter.fullname,
				contentText: content,
				productUrl,
				isReply: false
			});
		}
	}

	return { success: true };
};