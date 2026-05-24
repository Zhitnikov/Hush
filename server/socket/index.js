const path = require('path');
const { socketAuth } = require('./auth');
const { registerPresenceHandlers } = require('./handlers/presence');
const { registerMessageHandlers } = require('./handlers/messages');
const { registerCallHandlers } = require('./handlers/calls');
const { registerMediaRelayHandlers } = require('./handlers/mediaRelay');
const { runScheduledJob, recoverExpiredMessages } = require('../services/messageService');
const { SCHEDULED_JOB_MS } = require('../config/constants');
const logger = require('../utils/logger');

function initSocket(httpServer) {
  const { Server } = require('socket.io');
  const env = require('../config/env');

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (env.isAllowedOrigin(origin, env.corsOrigins, env.nodeEnv)) {
          cb(null, true);
        } else {
          cb(new Error('CORS not allowed'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  socketAuth(io);

  const uploadsDir = path.join(__dirname, '..', 'uploads');

  io.on('connection', (socket) => {
    logger.debug('Socket connected', { userId: socket.userId });
    registerPresenceHandlers(io, socket);
    registerMessageHandlers(io, socket, uploadsDir);
    registerCallHandlers(io, socket);
    registerMediaRelayHandlers(io, socket);
  });

  setInterval(() => runScheduledJob(io).catch((e) => logger.error('Scheduled job', { e: e.message })), SCHEDULED_JOB_MS);
  setInterval(() => recoverExpiredMessages(uploadsDir, io).catch((e) => logger.error('Expire job', { e: e.message })), SCHEDULED_JOB_MS);

  return io;
}

module.exports = { initSocket };
