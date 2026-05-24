const env = require('../config/env');
const { DEFAULT_STUN_SERVERS } = require('../config/constants');

function getWebRtcIceServers() {
  const iceServers = [];
  if (env.stunUrls) {
    env.stunUrls.split(',').filter(Boolean).forEach((url) => {
      iceServers.push({ urls: url.trim() });
    });
  }
  if (env.turnUrls) {
    iceServers.push({
      urls: env.turnUrls,
      username: env.turnUsername,
      credential: env.turnCredential,
    });
  }
  return iceServers.length ? [...DEFAULT_STUN_SERVERS, ...iceServers] : DEFAULT_STUN_SERVERS;
}

module.exports = { getWebRtcIceServers };
