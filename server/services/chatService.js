const axios = require('axios');
const User = require('../models/User');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const { lastMessagePreviewFromDoc } = require('../utils/messagePreview');
const { assertSafeUrl } = require('../utils/ssrfGuard');
const { parseMessageLimit, parseBeforeDate } = require('../utils/pagination');
const { toUserListItemDto } = require('../dto/userDto');
const { toChannelListItemDto } = require('../dto/channelDto');
const { toMessagesPageDto, toThreadMessagesDto } = require('../dto/messageDto');
const {
  SEARCH_MESSAGES_LIMIT,
  GLOBAL_SEARCH_LIMIT,
  DIRECTORY_SEARCH_LIMIT,
  LINK_PREVIEW_TIMEOUT_MS,
  LINK_PREVIEW_MAX_BYTES,
  LINK_PREVIEW_USER_AGENT,
} = require('../config/constants');

async function lastMessageMetaForDm(userId, peerId) {
  const last = await Message.findOne({
    isDeleted: { $ne: true },
    $or: [
      { sender: peerId, receiver: userId },
      { sender: userId, receiver: peerId },
    ],
  })
    .sort({ createdAt: -1 })
    .select('fileType fileUrl isAudio isVideoCircle poll content createdAt')
    .lean();
  const unreadCount = await Message.countDocuments({
    sender: peerId,
    receiver: userId,
    readBy: { $ne: userId },
  });
  return {
    unreadCount,
    lastMessage: lastMessagePreviewFromDoc(last),
    lastMessageAt: last?.createdAt || null,
  };
}

async function lastMessageMetaForChannel(userId, channelId) {
  const last = await Message.findOne({
    channel: channelId,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .select('fileType fileUrl isAudio isVideoCircle poll content createdAt')
    .lean();
  const unreadCount = await Message.countDocuments({
    channel: channelId,
    readBy: { $ne: userId },
  });
  return {
    unreadCount,
    lastMessage: lastMessagePreviewFromDoc(last),
    lastMessageAt: last?.createdAt || null,
  };
}

async function listUsersWithMeta(userId) {
  const users = await User.find({ _id: { $ne: userId } }).select('-password');
  return Promise.all(
    users.map(async (u) => {
      const meta = await lastMessageMetaForDm(userId, u._id);
      return toUserListItemDto(u, meta);
    })
  );
}

async function listChannelsWithMeta(userId) {
  const channels = await Channel.find({ members: userId }).populate('creator', 'username');
  return Promise.all(
    channels.map(async (c) => {
      const meta = await lastMessageMetaForChannel(userId, c._id);
      return toChannelListItemDto(c, meta);
    })
  );
}

async function getChannelMessages(userId, channelId, query) {
  const limit = parseMessageLimit(query.limit);
  const before = parseBeforeDate(query.before);
  const filter = { channel: channelId, isDeleted: { $ne: true } };
  if (before) filter.createdAt = { $lt: before };
  const batch = await Message.find(filter)
    .populate('sender', 'username')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .limit(limit);
  return toMessagesPageDto(batch.reverse(), batch.length === limit);
}

async function getPrivateMessages(userId, otherUserId, query) {
  const limit = parseMessageLimit(query.limit);
  const before = parseBeforeDate(query.before);
  const base = {
    $or: [
      { sender: userId, receiver: otherUserId },
      { sender: otherUserId, receiver: userId },
    ],
  };
  const filter = before ? { ...base, createdAt: { $lt: before } } : base;
  const batch = await Message.find(filter)
    .populate('sender', 'username')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .limit(limit);
  return toMessagesPageDto(batch.reverse(), batch.length === limit);
}

async function getChatMedia(userId, chatId, chatType) {
  const filter = { fileUrl: { $ne: null } };
  if (chatType === 'channel') {
    filter.channel = chatId;
  } else {
    filter.$or = [
      { sender: userId, receiver: chatId },
      { sender: chatId, receiver: userId },
    ];
  }
  return Message.find(filter).sort({ createdAt: -1 });
}

async function searchInChat(userId, chatId, chatType, queryText) {
  if (!queryText) return [];
  const filter = {
    content: { $regex: queryText, $options: 'i' },
    isDeleted: false,
  };
  if (chatType === 'channel') {
    filter.channel = chatId;
  } else {
    filter.$or = [
      { sender: userId, receiver: chatId },
      { sender: chatId, receiver: userId },
    ];
  }
  return Message.find(filter)
    .populate('sender', 'username')
    .sort({ createdAt: -1 })
    .limit(SEARCH_MESSAGES_LIMIT);
}

async function searchGlobal(userId, queryText) {
  if (!queryText) return [];
  const channelIds = await Channel.find({ members: userId }).distinct('_id');
  return Message.find({
    $or: [
      { sender: userId },
      { receiver: userId },
      { channel: { $in: channelIds } },
    ],
    content: { $regex: queryText, $options: 'i' },
    isDeleted: false,
  })
    .populate('sender', 'username profilePic')
    .sort({ createdAt: -1 })
    .limit(GLOBAL_SEARCH_LIMIT);
}

async function getThreadMessages(threadId, query) {
  const limit = parseMessageLimit(query.limit);
  const root = await Message.findById(threadId);
  if (!root) {
    const err = new Error('Thread not found');
    err.status = 404;
    throw err;
  }
  const messages = await Message.find({ threadId: root._id, isDeleted: { $ne: true } })
    .populate('sender', 'username')
    .sort({ createdAt: 1 })
    .limit(limit);
  return toThreadMessagesDto(messages);
}

async function fetchLinkPreview(url) {
  const safeUrl = await assertSafeUrl(url);
  const { data } = await axios.get(safeUrl, {
    timeout: LINK_PREVIEW_TIMEOUT_MS,
    maxContentLength: LINK_PREVIEW_MAX_BYTES,
    headers: { 'User-Agent': LINK_PREVIEW_USER_AGENT },
    responseType: 'text',
  });
  const titleMatch = data.match(/<title>(.*?)<\/title>/i);
  const descMatch = data.match(/<meta name="description" content="(.*?)"/i)
    || data.match(/<meta property="og:description" content="(.*?)"/i);
  const imgMatch = data.match(/<meta property="og:image" content="(.*?)"/i);
  return {
    title: titleMatch ? titleMatch[1] : url,
    description: descMatch ? descMatch[1] : '',
    image: imgMatch ? imgMatch[1] : '',
    url,
  };
}

async function searchDirectory(userId, q) {
  if (!q) return { users: [], channels: [] };
  const [users, channels] = await Promise.all([
    User.find({ username: { $regex: q, $options: 'i' }, _id: { $ne: userId } })
      .limit(DIRECTORY_SEARCH_LIMIT)
      .select('username profilePic'),
    Channel.find({ name: { $regex: q, $options: 'i' } }).limit(DIRECTORY_SEARCH_LIMIT),
  ]);
  return { users, channels };
}

module.exports = {
  listUsersWithMeta,
  listChannelsWithMeta,
  getChannelMessages,
  getPrivateMessages,
  getChatMedia,
  searchInChat,
  searchGlobal,
  getThreadMessages,
  fetchLinkPreview,
  searchDirectory,
};
