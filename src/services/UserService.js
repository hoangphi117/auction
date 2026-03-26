import * as userModel from '../models/user.model.js';
import * as upgradeRequestModel from '../models/upgradeRequest.model.js';
import * as watchlistModel from '../models/watchlist.model.js';
import bcrypt from 'bcryptjs';

export async function getProfile(userId) {
  return await userModel.findById(userId);
}

export async function updateProfile(userId, data) {
  const currentUser = await userModel.findById(userId);

  if (!currentUser.oauth_provider) {
    if (!data.old_password || !bcrypt.compareSync(data.old_password, currentUser.password_hash)) {
      throw new Error('Password is incorrect!');
    }
  }

  if (data.email !== currentUser.email) {
    const existingUser = await userModel.findByEmail(data.email);
    if (existingUser) throw new Error('Email is already in use');
  }

  const entity = {
    email: data.email,
    fullname: data.fullname,
    address: data.address || currentUser.address,
    date_of_birth: data.date_of_birth ? new Date(data.date_of_birth) : currentUser.date_of_birth,
  };

  if (!currentUser.oauth_provider) {
    entity.password_hash = data.new_password
      ? bcrypt.hashSync(data.new_password, 10)
      : currentUser.password_hash;
  }

  return await userModel.update(userId, entity);
}

export async function requestUpgrade(userId) {
  await userModel.markUpgradePending(userId);
  await upgradeRequestModel.createUpgradeRequest(userId);
}

export async function getUpgrade(userId) {
  return await upgradeRequestModel.findByUserId(userId);
}

export async function getWatchlist(userId, limit, offset) {
  return await watchlistModel.searchPageByUserId(userId, limit, offset);
}

export async function countWatchlist(userId) {
  return await watchlistModel.countByUserId(userId);
}