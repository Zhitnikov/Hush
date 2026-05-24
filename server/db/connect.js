const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../utils/logger');

let connecting = null;

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connecting) return connecting;

  const uri = env.mongoUri.includes('localhost')
    ? env.mongoUri.replace('localhost', '127.0.0.1')
    : env.mongoUri;

  connecting = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
  }).then((conn) => {
    logger.info('MongoDB connected', { host: conn.connection.host, db: conn.connection.name });
    connecting = null;
    return conn.connection;
  }).catch((err) => {
    connecting = null;
    logger.error('MongoDB connection failed', { err: err.message, uri: uri.replace(/\/\/.*@/, '//***@') });
    throw err;
  });

  return connecting;
}

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectMongo, isMongoReady };
