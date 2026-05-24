const { socketRoomId } = require('../../utils/socketRoom');

function registerCallHandlers(io, socket) {
  socket.on('call_user', ({ to, offer, name, type }) => {
    const target = socketRoomId(to);
    if (!target) return;
    io.to(target).emit('incoming_call', {
      from: socketRoomId(socket.userId),
      offer,
      name,
      type,
    });
  });

  socket.on('answer_call', ({ to, answer }) => {
    const target = socketRoomId(to);
    if (!target) return;
    io.to(target).emit('call_answered', { answer });
  });

  socket.on('webrtc_signal', ({ to, signal }) => {
    const target = socketRoomId(to);
    if (!target) return;
    io.to(target).emit('webrtc_signal', { signal });
  });

  socket.on('end_call', ({ to }) => {
    const target = socketRoomId(to);
    if (!target) return;
    io.to(target).emit('call_ended');
  });
}

module.exports = { registerCallHandlers };
