const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'MONGO_URI'];

const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const TUNNEL_ORIGIN_RE = /^https:\/\/[\w-]+\.(loca\.lt|localhost\.run|trycloudflare\.com)$/;

function parseOrigins() {
  const raw = process.env.CORS_ORIGINS || 'http://localhost:3333,http://127.0.0.1:3333';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, corsOrigins, nodeEnv) {
  if (!origin) return true;
  if (corsOrigins.includes(origin)) return true;
  if (nodeEnv !== 'production' && DEV_ORIGIN_RE.test(origin)) return true;
  if (nodeEnv !== 'production' && TUNNEL_ORIGIN_RE.test(origin)) return true;
  return false;
}

function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        throw new Error(`Missing required env: ${key}`);
      }
    }
    if ((process.env.JWT_SECRET || '').length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
  }
}

module.exports = {
  validateEnv,
  isAllowedOrigin,
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/securemessenger',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-only-change-in-production'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  corsOrigins: parseOrigins(),
  nodeEnv: process.env.NODE_ENV || 'development',
  turnUrls: process.env.TURN_URLS || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
  stunUrls: process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
};
