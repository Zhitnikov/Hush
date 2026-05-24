const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');
const env = require('../config/env');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccess(user) {
  return jwt.sign(
    { userId: user.id || user._id?.toString(), username: user.username },
    env.jwtSecret,
    { expiresIn: env.jwtAccessExpires }
  );
}

async function createRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(raw),
    expiresAt,
  });
  return raw;
}

async function rotateRefreshToken(oldRaw) {
  const doc = await RefreshToken.findOne({
    tokenHash: hashToken(oldRaw),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!doc) return null;
  doc.revokedAt = new Date();
  await doc.save();
  const User = require('../models/User');
  const user = await User.findById(doc.userId);
  if (!user) return null;
  const access = signAccess(user);
  const newRaw = await createRefreshToken(doc.userId);
  return { userId: doc.userId, access, refresh: newRaw };
}

async function revokeRefreshToken(raw) {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(raw) },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

async function issueTokenPair(user) {
  const access = signAccess(user);
  const refresh = await createRefreshToken(user.id || user._id);
  return { access, refresh };
}

module.exports = {
  signAccess,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  hashToken,
};
