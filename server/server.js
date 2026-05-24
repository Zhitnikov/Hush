require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const { validateEnv } = require('./config/env');
const logger = require('./utils/logger');
const { connectMongo, isMongoReady } = require('./db/connect');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');
const { initSocket } = require('./socket');
const { getWebRtcIceServers } = require('./services/configService');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');

try {
  validateEnv();
} catch (e) {
  logger.error(e.message);
  if (env.nodeEnv === 'production') process.exit(1);
}

const app = express();
const server = http.createServer(app);

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: env.nodeEnv === 'production' ? undefined : false,
}));
app.use(compression());
app.use(cors({
  origin: (origin, cb) => {
    if (env.isAllowedOrigin(origin, env.corsOrigins, env.nodeEnv)) {
      return cb(null, true);
    }
    logger.warn('CORS blocked origin', { origin });
    return cb(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(apiLimiter);

app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.set('X-Content-Type-Options', 'nosniff');
  },
}));

app.get('/api/health', (req, res) => {
  res.json({
    ok: isMongoReady(),
    mongo: isMongoReady() ? 'connected' : 'disconnected',
    ts: Date.now(),
  });
});

app.get('/api/config/webrtc', (req, res) => {
  res.json({ iceServers: getWebRtcIceServers() });
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

app.use(notFound);
app.use(errorHandler);

async function bootstrap() {
  try {
    await connectMongo();
    initSocket(server);
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${env.port} is already in use. Stop Docker backend or set PORT=5001 in server/.env`, { port: env.port });
      } else {
        logger.error('Server error', { err: err.message });
      }
      process.exit(1);
    });
    server.listen(env.port, '0.0.0.0', () => {
      logger.info(`Server listening on 0.0.0.0:${env.port}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { err: err.message });
    process.exit(1);
  }
}

bootstrap();
