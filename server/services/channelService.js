const Channel = require('../models/Channel');
const Message = require('../models/Message');
const { toInviteDto } = require('../dto/channelDto');
const { PIN_ROLES } = require('../config/constants');

async function createChannel(userId, { name, description, type }) {
  const channel = new Channel({
    name,
    description,
    type: type || 'group',
    creator: userId,
  });
  await channel.save();
  return channel;
}

async function joinChannel(userId, channelId) {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  if (!channel.members.includes(userId)) {
    channel.members.push(userId);
    await channel.save();
  }
  return channel;
}

async function getChannelMembers(channelId) {
  const channel = await Channel.findById(channelId).populate('members', 'username publicKey');
  if (!channel) {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  return channel.members;
}

async function updateChannelKeys(channel, keys) {
  if (!Array.isArray(keys)) {
    const err = new Error('Invalid keys payload');
    err.status = 400;
    throw err;
  }
  channel.encryptedKeys = keys;
  await channel.save();
  return { msg: 'Keys updated' };
}

async function pinMessage(userId, channelId, messageId) {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  const role = channel.getMemberRole(userId);
  if (!PIN_ROLES.includes(role)) {
    const err = new Error('Unauthorized');
    err.status = 403;
    throw err;
  }
  channel.pinnedMessage = messageId;
  await channel.save();
  const pinned = await Message.findById(messageId).populate('sender', 'username');
  return { msg: 'Message pinned', pinnedMessage: pinned };
}

async function enableInvite(channel) {
  channel.inviteEnabled = true;
  const token = channel.ensureInviteToken();
  await channel.save();
  return toInviteDto(token);
}

async function joinByToken(userId, token) {
  const channel = await Channel.findOne({ inviteToken: token, inviteEnabled: true });
  if (!channel) {
    const err = new Error('Invalid invite');
    err.status = 404;
    throw err;
  }
  if (!channel.members.some((m) => m.toString() === userId)) {
    channel.members.push(userId);
    channel.memberRoles.push({ userId, role: 'member' });
    await channel.save();
  }
  return channel;
}

async function requestJoin(userId, channelId) {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  if (channel.members.some((m) => m.toString() === userId)) {
    return { msg: 'Already a member' };
  }
  if (!channel.joinRequests.some((r) => r.userId.toString() === userId)) {
    channel.joinRequests.push({ userId });
    await channel.save();
  }
  return { msg: 'Request sent' };
}

async function setMemberRole(channel, targetUserId, role) {
  if (!['admin', 'moderator', 'member'].includes(role)) {
    const err = new Error('Invalid role');
    err.status = 400;
    throw err;
  }
  const idx = channel.memberRoles.findIndex((r) => r.userId.toString() === targetUserId);
  if (idx >= 0) channel.memberRoles[idx].role = role;
  else channel.memberRoles.push({ userId: targetUserId, role });
  await channel.save();
  return channel;
}

async function getChannelStats(channelId) {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  const [msgCount, membersCount] = await Promise.all([
    Message.countDocuments({ channel: channelId }),
    Promise.resolve(channel.members.length),
  ]);
  const topContributors = await Message.aggregate([
    { $match: { channel: channel._id } },
    { $group: { _id: '$sender', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 3 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { username: '$user.username', count: 1 } },
  ]);
  return { msgCount, membersCount, topContributors };
}

module.exports = {
  createChannel,
  joinChannel,
  getChannelMembers,
  updateChannelKeys,
  pinMessage,
  enableInvite,
  joinByToken,
  requestJoin,
  setMemberRole,
  getChannelStats,
};
