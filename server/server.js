require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/securemessenger';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

setInterval(async () => {
  try {
    const pending = await Message.find({
      scheduledAt: { $ne: null, $lte: new Date() }
    }).populate('sender', 'username').populate('replyTo');
    for (const msg of pending) {
      const target = msg.isChannel ? msg.channel.toString() : msg.receiver.toString();
      io.to(target).emit('receive_message', msg);
      io.to(msg.sender._id.toString()).emit('receive_message', msg);
      msg.scheduledAt = null;
      await msg.save();
    }
  } catch (e) { console.error('Scheduled job error:', e); }
}, 5000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_user', async (userId) => {
    socket.join(userId);
    socket.userId = userId;
    console.log(`User ${userId} joined room ${userId}`);

    const User = require('./models/User');
    await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
    io.emit('user_status_change', { userId, status: 'online', lastSeen: new Date() });
  });

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on('send_message', async (data) => {
    try {
      const { senderId, receiverId, content, isChannel, channelId, fileUrl, fileType, replyTo, timer, poll, isVideoCircle } = data;

      let expiresAt = null;
      if (timer) {
        expiresAt = new Date(Date.now() + timer * 1000);
      }

      if (!isChannel) {
        const User = require('./models/User');
        const receiver = await User.findById(receiverId);
        if (receiver && receiver.blockedUsers.includes(senderId)) {
          return;
        }
      } else {
        const Channel = require('./models/Channel');
        const channel = await Channel.findById(channelId);
        if (channel && channel.type === 'broadcast' && channel.creator.toString() !== senderId) {
          return;
        }
      }

      const newMessage = new Message({
        sender: senderId,
        content,
        fileUrl,
        fileType,
        isChannel,
        replyTo: replyTo || undefined,
        expiresAt,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        receiver: isChannel ? undefined : receiverId,
        channel: isChannel ? channelId : undefined,
        readBy: [senderId],
        poll: poll || undefined,
        isVideoCircle: isVideoCircle || false,
        createdAt: new Date()
      });
      await newMessage.save();

      if (data.scheduledAt && new Date(data.scheduledAt) > new Date()) {
        socket.emit('message_scheduled', newMessage);
        return;
      }

      const populatedMsg = await Message.findById(newMessage._id).populate('sender', 'username').populate('replyTo');

      if (isChannel) {
        io.to(channelId).emit('receive_message', populatedMsg);
        socket.emit('receive_message', populatedMsg);
      } else {
        io.to(receiverId).emit('receive_message', populatedMsg);
        io.to(senderId).emit('receive_message', populatedMsg);
      }

      if (timer) {
        setTimeout(async () => {
          try {
            const msgToDelete = await Message.findById(newMessage._id);
            if (msgToDelete) {
              if (msgToDelete.fileUrl) {
                const fPath = path.join(__dirname, msgToDelete.fileUrl);
                if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
              }
              await Message.findByIdAndDelete(newMessage._id);

              const target = isChannel ? channelId : receiverId;
              io.to(target).emit('message_deleted_hard', newMessage._id);
              io.to(senderId).emit('message_deleted_hard', newMessage._id);
            }
          } catch (err) { console.error('Self-destruct error:', err); }
        }, timer * 1000);
      }
    } catch (err) {
      console.error('Message error:', err);
    }
  });

  socket.on('delete_message', async ({ messageId, userId }) => {
    try {
      const msg = await Message.findById(messageId);
      if (msg && (msg.sender.toString() === userId)) {
        if (msg.fileUrl) {
          const fPath = path.join(__dirname, msg.fileUrl);
          if (fs.existsSync(fPath)) {
            fs.unlinkSync(fPath);
          }
        }

        await Message.findByIdAndDelete(messageId);

        const target = msg.isChannel ? msg.channel.toString() : null;
        if (target) {
          io.to(target).emit('message_deleted_hard', messageId);
        } else {
          io.to(msg.receiver.toString()).emit('message_deleted_hard', messageId);
          io.to(msg.sender.toString()).emit('message_deleted_hard', messageId);
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  });

  socket.on('mark_read', async ({ chatType, chatId, userId }) => {
    try {
      let query = {};
      if (chatType === 'user') {
        query = { sender: chatId, receiver: userId, readBy: { $ne: userId } };
      } else {
        query = { channel: chatId, readBy: { $ne: userId } };
      }

      await Message.updateMany(query, { $addToSet: { readBy: userId } });

      if (chatType === 'user') {
        io.to(chatId).emit('messages_read', { chatId: userId });
      } else {
        io.to(chatId).emit('messages_read', { chatId, userId });
      }
    } catch (err) {
      console.error('Read error:', err);
    }
  });

  socket.on('edit_message', async ({ messageId, newContent, userId }) => {
    try {
      const msg = await Message.findById(messageId);
      if (msg && msg.sender.toString() === userId && !msg.isDeleted) {
        msg.content = newContent;
        msg.isEdited = true;
        await msg.save();

        const target = msg.isChannel ? msg.channel.toString() : (msg.receiver.toString() === userId ? msg.sender.toString() : msg.receiver.toString());
        io.to(target).emit('message_updated', msg);
        socket.emit('message_updated', msg);
      }
    } catch (err) { console.error(err); }
  });

  socket.on('forward_message', async ({ originalMessageId, targetChatId, isChannel, senderId }) => {
    try {
      const original = await Message.findById(originalMessageId);
      if (!original || original.isDeleted) return;

      const forwarded = new Message({
        sender: senderId,
        content: original.content,
        fileUrl: original.fileUrl,
        fileType: original.fileType,
        isChannel,
        channel: isChannel ? targetChatId : undefined,
        receiver: isChannel ? undefined : targetChatId,
        createdAt: new Date(),
      });
      await forwarded.save();

      if (isChannel) {
        io.to(targetChatId).emit('receive_message', forwarded);
      } else {
        io.to(targetChatId).emit('receive_message', forwarded);
        socket.emit('receive_message', forwarded);
      }
    } catch (err) { console.error(err); }
  });

  socket.on('typing', ({ chatId, userId, username, isChannel }) => {
    socket.to(chatId).emit('user_typing', { chatId: isChannel ? chatId : userId, userId, username });
  });

  socket.on('stop_typing', ({ chatId, userId, isChannel }) => {
    socket.to(chatId).emit('user_stop_typing', { chatId: isChannel ? chatId : userId, userId });
  });

  socket.on('add_reaction', async ({ messageId, emoji, userId }) => {
    try {
      const msg = await Message.findById(messageId);
      if (msg) {
        msg.reactions = msg.reactions.filter(r => r.userId.toString() !== userId);
        msg.reactions.push({ emoji, userId });
        await msg.save();

        const target = msg.isChannel ? msg.channel.toString() : (msg.receiver.toString() === userId ? msg.sender.toString() : msg.receiver.toString());
        io.to(target).emit('reaction_updated', { messageId, reactions: msg.reactions });
        socket.emit('reaction_updated', { messageId, reactions: msg.reactions });
      }
    } catch (err) { console.error(err); }
  });

  socket.on('vote', async ({ messageId, optionIndex, userId }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg || !msg.poll) return;
      msg.poll.options.forEach((opt, idx) => {
        if (!msg.poll.isMultiple) opt.votes = opt.votes.filter(v => v.toString() !== userId);
        if (idx === optionIndex) {
          const vStr = userId.toString();
          if (!opt.votes.some(v => v.toString() === vStr)) opt.votes.push(userId);
          else opt.votes = opt.votes.filter(v => v.toString() !== vStr);
        }
      });
      await msg.save();
      const target = msg.isChannel ? msg.channel.toString() : (msg.sender.toString() === userId ? msg.receiver.toString() : msg.sender.toString());
      io.to(target).emit('receive_message', msg);
    } catch (e) { console.error(e); }
  });

  socket.on('message_viewed', async ({ messageId, userId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, { $inc: { views: 1 } });
    } catch (e) { console.error(e); }
  });

  socket.on('call_user', ({ to, offer, from, name, type }) => {
    io.to(to).emit('incoming_call', { from, offer, name, type });
  });

  socket.on('answer_call', ({ to, answer }) => {
    io.to(to).emit('call_answered', { answer });
  });

  socket.on('webrtc_signal', ({ to, signal }) => {
    io.to(to).emit('webrtc_signal', { signal });
  });

  socket.on('end_call', ({ to }) => {
    io.to(to).emit('call_ended');
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    try {
      if (socket.userId) {
        const User = require('./models/User');
        await User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() });
        io.emit('user_status_change', { userId: socket.userId, status: 'offline', lastSeen: new Date() });
      }
    } catch (err) {
      console.error('Disconnect update error:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
