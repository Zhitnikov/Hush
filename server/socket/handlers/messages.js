const path = require('path');
const fs = require('fs');
const Message = require('../../models/Message');
const User = require('../../models/User');
const Channel = require('../../models/Channel');
const {
  createAndEmitMessage,
  cancelSelfDestruct,
} = require('../../services/messageService');
const { uploadsFilePath } = require('../../utils/fileSecurity');
const { sanitizeMessageContent } = require('../../utils/sanitize');
const {
  SOCKET_MESSAGE_MAX_PER_WINDOW,
  SOCKET_RATE_WINDOW_MS,
  MEDIA_LOCAL_PREFIX,
} = require('../../config/constants');

function rateCheck(socket) {
  const now = Date.now();
  if (!socket._msgRate) socket._msgRate = { count: 0, windowStart: now };
  const r = socket._msgRate;
  if (now - r.windowStart > SOCKET_RATE_WINDOW_MS) {
    r.windowStart = now;
    r.count = 0;
  }
  r.count += 1;
  return r.count <= SOCKET_MESSAGE_MAX_PER_WINDOW;
}

function dmPeer(msg, actorId) {
  const sid = msg.sender.toString();
  const rid = msg.receiver?.toString();
  if (sid === actorId) return rid;
  return sid;
}

function emitToChat(io, msg, event, payload) {
  if (msg.isChannel) {
    io.to(msg.channel.toString()).emit(event, payload);
  } else {
    const a = msg.sender.toString();
    const b = msg.receiver.toString();
    io.to(a).emit(event, payload);
    io.to(b).emit(event, payload);
  }
}

function registerMessageHandlers(io, socket, uploadsDir) {
  socket.on('send_message', async (data) => {
    if (!rateCheck(socket)) return;
    try {
      const result = await createAndEmitMessage(io, data, socket.userId, uploadsDir);
      if (result.scheduled) socket.emit('message_scheduled', result.scheduled);
    } catch (err) {
      socket.emit('error_message', { msg: 'Failed to send message' });
    }
  });

  socket.on('delete_message', async ({ messageId, forEveryone }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      const isSender = msg.sender.toString() === socket.userId;
      let canDelete = isSender;
      if (forEveryone && msg.isChannel) {
        const ch = await Channel.findById(msg.channel);
        const role = ch?.getMemberRole(socket.userId);
        canDelete = ['owner', 'admin', 'moderator'].includes(role) || isSender;
      }
      if (!canDelete) return;

      cancelSelfDestruct(msg._id);
      if (msg.fileUrl && !String(msg.fileUrl).startsWith(MEDIA_LOCAL_PREFIX)) {
        const fPath = uploadsFilePath(msg.fileUrl, uploadsDir);
        if (fPath && fs.existsSync(fPath)) fs.unlinkSync(fPath);
      }

      if (forEveryone) {
        await Message.findByIdAndDelete(messageId);
        emitToChat(io, msg, 'message_deleted_hard', messageId.toString());
      } else {
        msg.isDeleted = true;
        msg.content = '';
        msg.fileUrl = null;
        await msg.save();
        emitToChat(io, msg, 'message_deleted', { messageId });
      }
    } catch (err) {
      socket.emit('error_message', { msg: 'Delete failed' });
    }
  });

  socket.on('mark_read', async ({ chatType, chatId }) => {
    try {
      const userId = socket.userId;
      let query = {};
      if (chatType === 'user') {
        query = { sender: chatId, receiver: userId, readBy: { $ne: userId } };
      } else {
        query = { channel: chatId, readBy: { $ne: userId } };
      }
      await Message.updateMany(query, { $addToSet: { readBy: userId } });
      if (chatType === 'user') {
        io.to(chatId).emit('messages_read', { chatId: userId, readerId: userId });
        io.to(userId).emit('messages_read', { chatId, readerId: userId });
      } else {
        io.to(chatId).emit('messages_read', { chatId, readerId: userId });
      }
    } catch (err) { void err; }
  });

  socket.on('edit_message', async ({ messageId, newContent }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg || msg.sender.toString() !== socket.userId || msg.isDeleted) return;
      const prev = msg.editHistory || [];
      if (msg.content) prev.push({ content: msg.content, at: new Date() });
      msg.content = sanitizeMessageContent(newContent);
      msg.isEdited = true;
      msg.editHistory = prev.slice(-20);
      await msg.save();
      const populated = await Message.findById(msg._id).populate('sender', 'username').populate('replyTo');
      emitToChat(io, msg, 'message_updated', populated);
    } catch (err) { void err; }
  });

  socket.on('forward_message', async ({ originalMessageId, targetChatId, isChannel }) => {
    try {
      const original = await Message.findById(originalMessageId);
      if (!original || original.isDeleted) return;
      if (isChannel) {
        const ch = await Channel.findById(targetChatId);
        if (ch?.settings?.restrictForward) return;
      }
      await createAndEmitMessage(io, {
        receiverId: isChannel ? undefined : targetChatId,
        channelId: isChannel ? targetChatId : undefined,
        isChannel,
        content: original.content,
        fileUrl: original.fileUrl,
        fileType: original.fileType,
        forwardFrom: original._id,
      }, socket.userId, uploadsDir);
    } catch (err) { void err; }
  });

  socket.on('typing', ({ chatId, isChannel }) => {
    socket.to(chatId).emit('user_typing', {
      chatId: isChannel ? chatId : socket.userId,
      userId: socket.userId,
      username: socket.username,
    });
  });

  socket.on('stop_typing', ({ chatId, isChannel }) => {
    socket.to(chatId).emit('user_stop_typing', {
      chatId: isChannel ? chatId : socket.userId,
      userId: socket.userId,
    });
  });

  socket.on('add_reaction', async ({ messageId, emoji }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      msg.reactions = (msg.reactions || []).filter((r) => r.userId.toString() !== socket.userId);
      msg.reactions.push({ emoji, userId: socket.userId });
      await msg.save();
      emitToChat(io, msg, 'reaction_updated', { messageId, reactions: msg.reactions });
    } catch (err) { void err; }
  });

  socket.on('vote', async ({ messageId, optionIndex }) => {
    try {
      const msg = await Message.findOneAndUpdate(
        { _id: messageId, 'poll.options': { $exists: true } },
        {},
        { new: false }
      );
      if (!msg?.poll) return;
      const userId = socket.userId;
      msg.poll.options.forEach((opt, idx) => {
        if (!msg.poll.isMultiple) opt.votes = opt.votes.filter((v) => v.toString() !== userId);
        if (idx === optionIndex) {
          const has = opt.votes.some((v) => v.toString() === userId);
          if (has) opt.votes = opt.votes.filter((v) => v.toString() !== userId);
          else opt.votes.push(userId);
        }
      });
      await msg.save();
      emitToChat(io, msg, 'receive_message', msg);
    } catch (err) { void err; }
  });

  socket.on('message_viewed', async ({ messageId }) => {
    try {
      await Message.findOneAndUpdate(
        { _id: messageId, viewedBy: { $ne: socket.userId } },
        { $inc: { views: 1 }, $addToSet: { viewedBy: socket.userId } }
      );
    } catch (err) { void err; }
  });

  socket.on('get_read_receipts', async ({ messageId }) => {
    try {
      const msg = await Message.findById(messageId).populate('readBy', 'username profilePic');
      if (!msg) return;
      const allowed = msg.sender.toString() === socket.userId ||
        msg.readBy.some((u) => u._id.toString() === socket.userId);
      if (!allowed) return;
      socket.emit('read_receipts', {
        messageId,
        readers: (msg.readBy || []).map((u) => ({
          id: u._id,
          username: u.username,
          profilePic: u.profilePic,
        })),
      });
    } catch (err) { void err; }
  });
}

module.exports = { registerMessageHandlers };
