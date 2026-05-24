const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({ msg: 'Not found' });
}

function errorHandler(err, req, res, next) {
  logger.error(err.message || 'Unhandled error', { path: req.path, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    msg: status < 500 ? err.message : 'Server error',
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
}

module.exports = { notFound, errorHandler };
