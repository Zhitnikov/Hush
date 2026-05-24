const { MESSAGE_PAGE_DEFAULT, MESSAGE_PAGE_MAX } = require('../config/constants');

function parseMessageLimit(limitRaw) {
  const n = parseInt(limitRaw, 10);
  return Math.min(Math.max(Number.isFinite(n) ? n : MESSAGE_PAGE_DEFAULT, 1), MESSAGE_PAGE_MAX);
}

function parseBeforeDate(beforeRaw) {
  if (!beforeRaw) return null;
  const d = new Date(beforeRaw);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { parseMessageLimit, parseBeforeDate };
