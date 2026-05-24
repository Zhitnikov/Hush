const { socketRoomId } = require('../../utils/socketRoom');

function registerMediaRelayHandlers(io, socket) {
  socket.on('media_transfer_start', (payload) => {
    const { to, transferId, isChannel, channelId } = payload || {};
    if (!transferId) return;
    const room = isChannel && channelId ? socketRoomId(channelId) : socketRoomId(to);
    if (!room) return;
    socket.to(room).emit('media_transfer_start', {
      ...payload,
      from: socket.userId,
    });
  });

  socket.on('media_transfer_chunk', (payload) => {
    const { to, isChannel, channelId } = payload || {};
    const room = isChannel && channelId ? socketRoomId(channelId) : socketRoomId(to);
    if (!room) return;
    socket.to(room).emit('media_transfer_chunk', {
      ...payload,
      from: socket.userId,
    });
  });

  socket.on('media_transfer_end', (payload) => {
    const { to, transferId, isChannel, channelId } = payload || {};
    const room = isChannel && channelId ? socketRoomId(channelId) : socketRoomId(to);
    if (!room || !transferId) return;
    socket.to(room).emit('media_transfer_end', {
      ...payload,
      from: socket.userId,
    });
  });
}

module.exports = { registerMediaRelayHandlers };
