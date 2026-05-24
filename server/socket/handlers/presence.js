const User = require('../../models/User');
const { socketRoomId } = require('../../utils/socketRoom');

const onlineCounts = new Map();

function registerPresenceHandlers(io, socket) {
  socket.on('join_user', async () => {
    const userId = socketRoomId(socket.userId);
    socket.join(userId);
    const prev = onlineCounts.get(userId) || 0;
    onlineCounts.set(userId, prev + 1);

    await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
    if (prev === 0) {
      io.emit('user_status_change', { userId, status: 'online', lastSeen: new Date() });
    }
  });

  socket.on('join_room', (roomId) => {
    if (roomId) socket.join(socketRoomId(roomId));
  });

  socket.on('disconnect', async () => {
    const userId = socketRoomId(socket.userId);
    if (!userId) return;
    const prev = onlineCounts.get(userId) || 0;
    const next = Math.max(0, prev - 1);
    if (next === 0) {
      onlineCounts.delete(userId);
      await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
      io.emit('user_status_change', { userId, status: 'offline', lastSeen: new Date() });
    } else {
      onlineCounts.set(userId, next);
    }
  });
}

module.exports = { registerPresenceHandlers };
