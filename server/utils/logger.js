const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const current = levels[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'production' ? 2 : 3);

function log(level, msg, meta) {
  if (levels[level] > current) return;
  const line = { ts: new Date().toISOString(), level, msg, ...(meta && { meta }) };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(line));
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
