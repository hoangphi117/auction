import * as watchListModel from '../models/watchlist.model.js';

export const addToWatchlist = async (userId, productId) => {
	const isInWatchlist = await watchListModel.isInWatchlist(userId, productId);
	if (!isInWatchlist) {
		await watchListModel.addToWatchlist(userId, productId);
	}
	return { success: true };
};

export const removeFromWatchlist = async (userId, productId) => {
	await watchListModel.removeFromWatchlist(userId, productId);
	return { success: true };
};

export const isInWatchlist = async (userId, productId) => {
	return await watchListModel.isInWatchlist(userId, productId);
};