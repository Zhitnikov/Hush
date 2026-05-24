const path = require('fs');
const Message = require('../models/Message');
const User = require('../models/User');
const Channel = require('../models/Channel');
const { uploadsFilePath } = require('../utils/fileSecurity');
const { sanitizeMessageContent } = require('../utils/sanitize');
const logger = require('../utils/logger');
const { MEDIA_LOCAL_PREFIX } = require('../config/constants');

const selfDestructTimers = new Map();

function isLocalMediaUrl(fileUrl) {
  return typeof fileUrl === 'string' && fileUrl.startsWith(MEDIA_LOCAL_PREFIX);
}

function scheduleSelfDestruct(messageId, timerSec, uploadsDir, io, senderId, isChannel, targetId) {
  const existing = selfDestructTimers.get(messageId.toString());
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    selfDestructTimers.delete(messageId.toString());
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      if (msg.fileUrl && !isLocalMediaUrl(msg.fileUrl)) {
        const fPath = uploadsFilePath(msg.fileUrl, uploadsDir);
        if (fPath && fs.existsSync(fPath)) fs.unlinkSync(fPath);
      }
      await Message.findByIdAndDelete(messageId);
      io.to(targetId).emit('message_deleted_hard', messageId.toString());
      io.to(senderId).emit('message_deleted_hard', messageId.toString());
    } catch (err) {
      logger.error('Self-destruct failed', { messageId, err: err.message });
    }
  }, timerSec * 1000);

  selfDestructTimers.set(messageId.toString(), timeout);
}

function cancelSelfDestruct(messageId) {
  const t = selfDestructTimers.get(messageId?.toString?.());
  if (t) {
    clearTimeout(t);
    selfDestructTimers.delete(messageId.toString());
  }
}

async function canSendToChannel(channelId, senderId) {
  const channel = await Channel.findById(channelId);
  if (!channel) return { ok: false };
  if (!channel.members.some((m) => m.toString() === senderId)) return { ok: false, reason: 'not_member' };
  if (channel.type === 'broadcast' && channel.creator.toString() !== senderId) {
    return { ok: false, reason: 'broadcast_only_creator' };
  }
  if (channel.settings?.mediaOnly) {
    return { ok: false, reason: 'media_only' };
  }
  const role = channel.getMemberRole(senderId);
  if (role === 'member' && channel.settings?.membersCannotPost) {
    return { ok: false, reason: 'restricted' };
  }
  return { ok: true, channel };
}

async function createAndEmitMessage(io, data, senderId, uploadsDir) {
  const {
    receiverId, content, isChannel, channelId, fileUrl, fileType,
    replyTo, timer, poll, isVideoCircle, scheduledAt, ogPreview, threadId, forwardFrom,
  } = data;

  if (!isChannel) {
    const receiver = await User.findById(receiverId);
    if (receiver?.blockedUsers?.some((id) => id.toString() === senderId)) {
      return { blocked: true };
    }
  } else {
    const check = await canSendToChannel(channelId, senderId);
    if (!check.ok) return { denied: check.reason };
  }

  const safeContent = sanitizeMessageContent(content);
  const newMessage = new Message({
    sender: senderId,
    content: safeContent,
    fileUrl,
    fileType,
    isChannel,
    replyTo: replyTo || undefined,
    threadId: threadId || undefined,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    receiver: isChannel ? undefined : receiverId,
    channel: isChannel ? channelId : undefined,
    readBy: [senderId],
    poll: poll || undefined,
    isVideoCircle: isVideoCircle || false,
    ogPreview: ogPreview || undefined,
    forwardFrom: forwardFrom || undefined,
    createdAt: new Date(),
  });
  if (timer) newMessage.expiresAt = new Date(Date.now() + timer * 1000);
  await newMessage.save();

  if (scheduledAt && new Date(scheduledAt) > new Date()) {
    return { scheduled: newMessage };
  }

  const populated = await Message.findById(newMessage._id)
    .populate('sender', 'username profilePic')
    .populate('replyTo');

  const target = isChannel ? channelId : receiverId;
  io.to(target).emit('receive_message', populated);
  io.to(senderId).emit('receive_message', populated);

  if (timer) {
    scheduleSelfDestruct(newMessage._id, timer, uploadsDir, io, senderId, isChannel, target);
  }
  return { message: populated };
}

async function runScheduledJob(io) {
  const pending = await Message.find({
    scheduledAt: { $ne: null, $lte: new Date() },
  })
    .populate('sender', 'username')
    .populate('replyTo');

  for (const msg of pending) {
    const updated = await Message.findOneAndUpdate(
      { _id: msg._id, scheduledAt: { $ne: null } },
      { $set: { scheduledAt: null } },
      { new: true }
    ).populate('sender', 'username').populate('replyTo');

    if (!updated) continue;
    const target = updated.isChannel ? updated.channel.toString() : updated.receiver.toString();
    io.to(target).emit('receive_message', updated);
    io.to(updated.sender._id.toString()).emit('receive_message', updated);
  }
}

async function recoverExpiredMessages(uploadsDir, io) {
  const expired = await Message.find({ expiresAt: { $ne: null, $lte: new Date() } });
  for (const msg of expired) {
    cancelSelfDestruct(msg._id);
    if (msg.fileUrl && !isLocalMediaUrl(msg.fileUrl)) {
      const fPath = uploadsFilePath(msg.fileUrl, uploadsDir);
      if (fPath && fs.existsSync(fPath)) fs.unlinkSync(fPath);
    }
    await Message.findByIdAndDelete(msg._id);
    const target = msg.isChannel ? msg.channel.toString() : msg.receiver.toString();
    io.to(target).emit('message_deleted_hard', msg._id.toString());
    io.to(msg.sender.toString()).emit('message_deleted_hard', msg._id.toString());
  }
}

module.exports = {
  createAndEmitMessage,
  runScheduledJob,
  recoverExpiredMessages,
  cancelSelfDestruct,
  scheduleSelfDestruct,
  canSendToChannel,
};
