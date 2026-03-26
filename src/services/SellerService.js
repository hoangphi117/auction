import * as productModel from '../models/product.model.js';
import * as reviewModel from '../models/review.model.js';
import * as productDescUpdateModel from '../models/productDescriptionUpdate.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import * as productCommentModel from '../models/productComment.model.js';
import { sendMail } from '../utils/mailer.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../middlewares/async-handler.js';
import path from 'path';
import fs from 'fs';

// ================= QUERY =================
export const getDashboard = (sellerId) =>
    productModel.getSellerStats(sellerId);

export const getAllProducts = (sellerId) =>
    productModel.findAllProductsBySellerId(sellerId);

export const getActiveProducts = (sellerId) =>
    productModel.findActiveProductsBySellerId(sellerId);

export const getPendingProducts = async (sellerId) => {
    const [products, stats] = await Promise.all([
        productModel.findPendingProductsBySellerId(sellerId),
        productModel.getPendingProductsStats(sellerId)
    ]);
    return { products, stats };
};

export const getSoldProducts = async (sellerId) => {
    const [products, stats] = await Promise.all([
        productModel.findSoldProductsBySellerId(sellerId),
        productModel.getSoldProductsStats(sellerId)
    ]);

    const mapped = await Promise.all(products.map(async (p) => {
        const review = await reviewModel.getProductReview(sellerId, p.highest_bidder_id, p.id);
        const has = review && review.rating !== 0;

        return {
            ...p,
            hasReview: has,
            reviewRating: has ? (review.rating === 1 ? 'positive' : 'negative') : null,
            reviewComment: has ? review.comment : ''
        };
    }));

    return { products: mapped, stats };
};

export const getExpiredProducts = async (sellerId) => {
    const products = await productModel.findExpiredProductsBySellerId(sellerId);

    for (let p of products) {
        if (p.status === 'Cancelled' && p.highest_bidder_id) {
            const review = await reviewModel.getProductReview(sellerId, p.highest_bidder_id, p.id);
            if (review && review.rating !== 0) {
                p.hasReview = true;
                p.reviewRating = review.rating === 1 ? 'positive' : 'negative';
                p.reviewComment = review.comment;
            }
        }
    }

    return products;
};

// ================= PRODUCT =================
export const createProduct = async (data, sellerId) => {
    const productData = mapProductData(data, sellerId);
    const result = await productModel.addProduct(productData);
    const productId = result[0].id;

    await handleImages(productId, data);

    return productId;
};

export const cancelProduct = async (productId, sellerId, { reason, highest_bidder_id }) => {
    await productModel.cancelProduct(productId, sellerId);

    if (highest_bidder_id) {
        await reviewModel.createReview({
            reviewer_id: sellerId,
            reviewee_id: highest_bidder_id,
            product_id: productId,
            rating: -1,
            comment: reason || 'Auction cancelled'
        });
    }
};

// ================= REVIEW =================
export const rateBidder = async (productId, sellerId, body) => {
    const { rating, comment, highest_bidder_id } = body;

    if (!highest_bidder_id) throw new ValidationError('No bidder');

    const value = rating === 'positive' ? 1 : -1;

    const existing = await reviewModel.findByReviewerAndProduct(sellerId, productId);

    if (existing) {
        return reviewModel.updateByReviewerAndProduct(sellerId, productId, {
            rating: value,
            comment
        });
    }

    return reviewModel.createReview({
        reviewer_id: sellerId,
        reviewee_id: highest_bidder_id,
        product_id: productId,
        rating: value,
        comment
    });
};

export const updateRating = async (productId, sellerId, body) => {
    const { rating, comment, highest_bidder_id } = body;

    if (!highest_bidder_id) throw new ValidationError('No bidder');

    return reviewModel.updateReview(sellerId, highest_bidder_id, productId, {
        rating: rating === 'positive' ? 1 : -1,
        comment
    });
};

// ================= DESCRIPTION =================
export const appendDescription = async (productId, sellerId, { description }, req) => {
    if (!description?.trim()) throw new ValidationError('Description required');

    const product = await productModel.findByProductId2(productId, null);
    if (!product) throw new NotFoundError();
    if (product.seller_id !== sellerId) throw new UnauthorizedError();

    await productDescUpdateModel.addUpdate(productId, description.trim());

    const users = await getNotifyUsers(productId, sellerId);
    sendEmails(users, product, description, req);
};

export const getDescriptionUpdates = async (productId, sellerId) => {
    const product = await productModel.findByProductId2(productId, null);
    if (!product) throw new NotFoundError();
    if (product.seller_id !== sellerId) throw new UnauthorizedError();

    return productDescUpdateModel.findByProductId(productId);
};

export const updateDescription = async (updateId, sellerId, { content }) => {
    if (!content?.trim()) throw new ValidationError();

    const update = await productDescUpdateModel.findById(updateId);
    const product = await productModel.findByProductId2(update.product_id, null);

    if (product.seller_id !== sellerId) throw new UnauthorizedError();

    await productDescUpdateModel.updateContent(updateId, content.trim());
};

export const deleteDescription = async (updateId, sellerId) => {
    const update = await productDescUpdateModel.findById(updateId);
    const product = await productModel.findByProductId2(update.product_id, null);

    if (product.seller_id !== sellerId) throw new UnauthorizedError();

    await productDescUpdateModel.deleteUpdate(updateId);
};

// ================= HELPERS =================
const mapProductData = (p, sellerId) => ({
    seller_id: sellerId,
    category_id: p.category_id,
    name: p.name,
    starting_price: p.start_price.replace(/,/g, ''),
    step_price: p.step_price.replace(/,/g, ''),
    buy_now_price: p.buy_now_price ? p.buy_now_price.replace(/,/g, '') : null,
    created_at: new Date(p.created_at),
    end_at: new Date(p.end_date),
    auto_extend: p.auto_extend === '1',
    description: p.description,
    current_price: p.start_price.replace(/,/g, ''),
    allow_unrated_bidder: p.allow_new_bidders === '1'
});

const handleImages = async (productId, data) => {
    const dir = path.join('public', 'images', 'products');

    const thumbNew = path.join(dir, `p${productId}_thumb.jpg`);
    const thumbOld = path.join('public', 'uploads', path.basename(data.thumbnail));

    fs.renameSync(thumbOld, thumbNew);

    await productModel.updateProductThumbnail(productId, `/images/products/p${productId}_thumb.jpg`);

    const imgs = JSON.parse(data.imgs_list);
    let i = 1;
    const arr = [];

    for (const img of imgs) {
        const oldPath = path.join('public', 'uploads', path.basename(img));
        const newPath = path.join(dir, `p${productId}_${i}.jpg`);

        fs.renameSync(oldPath, newPath);

        arr.push({
            product_id: productId,
            img_link: `/images/products/p${productId}_${i}.jpg`
        });
        i++;
    }

    await productModel.addProductImages(arr);
};

const getNotifyUsers = async (productId, sellerId) => {
    const [bidders, commenters] = await Promise.all([
        biddingHistoryModel.getUniqueBidders(productId),
        productCommentModel.getUniqueCommenters(productId)
    ]);

    const map = new Map();

    [...bidders, ...commenters].forEach(u => {
        if (u.id !== sellerId && !map.has(u.email)) {
            map.set(u.email, u);
        }
    });

    return Array.from(map.values());
};

const sendEmails = (users, product, description, req) => {
    if (!users.length) return;

    const productUrl = `${req.protocol}://${req.get('host')}/products/detail?id=${product.id}`;

    Promise.all(users.map(user => {
        return sendMail({
            to: user.email,
            subject: `[Auction Update] New description added for "${product.name}"`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #72AEC8 0%, #5a9bb8 100%); padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">Product Description Updated</h1>
                    </div>
                    <div style="padding: 20px; background: #f9f9f9;">
                        <p>Hello <strong>${user.fullname}</strong>,</p>
                        <p>The seller has added new information to the product description:</p>
                        <div style="background: white; padding: 15px; border-left: 4px solid #72AEC8; margin: 15px 0;">
                            <h3 style="margin: 0 0 10px 0; color: #333;">${product.name}</h3>
                            <p style="margin: 0; color: #666;">
                                Current Price: 
                                <strong style="color: #72AEC8;">
                                    ${new Intl.NumberFormat('en-US').format(product.current_price)} VND
                                </strong>
                            </p>
                        </div>
                        <div style="background: #fff8e1; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: #f57c00;">
                                <i>✉</i> New Description Added:
                            </p>
                            <div style="color: #333;">${description.trim()}</div>
                        </div>
                        <p>View the product to see the full updated description:</p>
                        <a href="${productUrl}" 
                           style="display: inline-block; background: #72AEC8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0;">
                           View Product
                        </a>
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px;">
                            You received this email because you placed a bid or asked a question on this product.
                        </p>
                    </div>
                </div>
            `
        }).catch(err => console.error('Failed to send email to', user.email, err));
    })).catch(err => console.error('Email notification error:', err));
};