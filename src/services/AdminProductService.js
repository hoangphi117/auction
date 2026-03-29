import * as productModel from '../models/product.model.js';
import * as userModel from '../models/user.model.js';
import path from 'path';
import fs from 'fs';

const PRODUCTS_DIR = path.join('public', 'images', 'products');

export const getAllProducts = async () => {
	const products = await productModel.findAll();
	return products.map(p => ({
		id: p.id,
		name: p.name,
		seller_name: p.seller_name,
		current_price: p.current_price,
		highest_bidder_name: p.highest_bidder_name
	}));
};

export const getProductForAdmin = async (productId) => {
	return await productModel.findByProductIdForAdmin(productId);
};

export const getSellers = async () => {
	return await userModel.findUsersByRole('seller');
};

export const createProduct = async (productData) => {
	const data = {
		seller_id: productData.seller_id,
		category_id: productData.category_id,
		name: productData.name,
		starting_price: productData.start_price.replace(/,/g, ''),
		step_price: productData.step_price.replace(/,/g, ''),
		buy_now_price: productData.buy_now_price !== '' ? productData.buy_now_price.replace(/,/g, '') : null,
		created_at: productData.created_at,
		end_at: productData.end_date,
		auto_extend: productData.auto_extend === '1' ? true : false,
		thumbnail: null,
		description: productData.description,
		highest_bidder_id: null,
		current_price: productData.start_price.replace(/,/g, ''),
		is_sold: null,
		closed_at: null,
		allow_unrated_bidder: productData.allow_new_bidders === '1' ? true : false
	};

	const returnedID = await productModel.addProduct(data);
	const productId = returnedID[0].id;

	await handleProductImages(productId, productData);

	return productId;
};

export const updateProduct = async (productId, productData) => {
	await productModel.updateProduct(productId, productData);
};

export const deleteProduct = async (productId) => {
	await productModel.deleteProduct(productId);
};

const handleProductImages = async (productId, data) => {
	const dirPath = PRODUCTS_DIR.replace(/\\/g, '/');

	const imgs = JSON.parse(data.imgs_list);

	const mainPath = path.join(dirPath, `p${productId}_thumb.jpg`).replace(/\\/g, '/');
	const oldMainPath = path.join('public', 'uploads', path.basename(data.thumbnail)).replace(/\\/g, '/');
	const savedMainPath = '/' + path.join('images', 'products', `p${productId}_thumb.jpg`).replace(/\\/g, '/');

	fs.renameSync(oldMainPath, mainPath);
	await productModel.updateProductThumbnail(productId, savedMainPath);

	let i = 1;
	const newImgPaths = [];

	for (const imgPath of imgs) {
		const oldPath = path.join('public', 'uploads', path.basename(imgPath)).replace(/\\/g, '/');
		const newPath = path.join(dirPath, `p${productId}_${i}.jpg`).replace(/\\/g, '/');
		const savedPath = '/' + path.join('images', 'products', `p${productId}_${i}.jpg`).replace(/\\/g, '/');

		fs.renameSync(oldPath, newPath);
		newImgPaths.push({
			product_id: productId,
			img_link: savedPath
		});
		i++;
	}

	await productModel.addProductImages(newImgPaths);
};