const bcrypt = require('bcryptjs');
const User = require('../models/User');
const tokenService = require('./tokenService');
const { toAuthUserDto } = require('../dto/userDto');

async function registerUser({ username, password, publicKey }) {
  const existing = await User.findOne({ username });
  if (existing) {
    const err = new Error('User already exists');
    err.status = 400;
    throw err;
  }
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const user = new User({ username, password: hashedPassword, publicKey });
  await user.save();
  const { access, refresh } = await tokenService.issueTokenPair(user);
  return {
    token: access,
    refreshToken: refresh,
    user: toAuthUserDto(user),
  };
}

async function loginUser({ username, password }) {
  const user = await User.findOne({ username }).select('+password');
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 400;
    throw err;
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.status = 400;
    throw err;
  }
  const { access, refresh } = await tokenService.issueTokenPair(user);
  return {
    token: access,
    refreshToken: refresh,
    user: toAuthUserDto(user),
  };
}

async function refreshSession(refreshToken) {
  const rotated = await tokenService.rotateRefreshToken(refreshToken);
  if (!rotated) {
    const err = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }
  const user = await User.findById(rotated.userId).select('-password');
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }
  const access = tokenService.signAccess(user);
  return {
    token: access,
    refreshToken: rotated.refresh,
    user: toAuthUserDto(user),
  };
}

async function logoutUser(userId, refreshToken) {
  if (refreshToken) await tokenService.revokeRefreshToken(refreshToken);
  await tokenService.revokeAllForUser(userId);
  return { msg: 'Logged out' };
}

async function updatePublicKey(userId, publicKey) {
  await User.findByIdAndUpdate(userId, { publicKey });
  return { msg: 'Public key updated' };
}

async function getProfile(userId) {
  return User.findById(userId).select('-password');
}

async function updateProfile(userId, fields) {
  const update = {};
  if (fields.name !== undefined) update.name = fields.name;
  if (fields.username !== undefined) update.username = fields.username;
  if (fields.bio !== undefined) update.bio = fields.bio;
  if (fields.profilePic !== undefined) update.profilePic = fields.profilePic;
  return User.findByIdAndUpdate(userId, { $set: update }, { new: true }).select('-password');
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password');
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    const err = new Error('Current password incorrect');
    err.status = 400;
    throw err;
  }
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();
  await tokenService.revokeAllForUser(userId);
  return { msg: 'Password updated; please sign in again' };
}

async function toggleBlock(userId, targetId) {
  const user = await User.findById(userId);
  const index = user.blockedUsers.indexOf(targetId);
  if (index > -1) {
    user.blockedUsers.splice(index, 1);
    await user.save();
    return { msg: 'User unblocked', blockedUsers: user.blockedUsers };
  }
  user.blockedUsers.push(targetId);
  await user.save();
  return { msg: 'User blocked', blockedUsers: user.blockedUsers };
}

async function getBlacklist(userId) {
  const user = await User.findById(userId).populate('blockedUsers', 'username profilePic');
  return user.blockedUsers;
}

async function getUserById(userId) {
  const user = await User.findById(userId).select('username profilePic bio name publicKey lastSeen');
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user;
}

module.exports = {
  registerUser,
  loginUser,
  refreshSession,
  logoutUser,
  updatePublicKey,
  getProfile,
  updateProfile,
  changePassword,
  toggleBlock,
  getBlacklist,
  getUserById,
};
