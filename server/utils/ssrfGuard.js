const { URL } = require('url');
const dns = require('dns').promises;
const net = require('net');

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip === '::1') return true;
  return false;
}

async function assertSafeUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Protocol not allowed');
  if (BLOCKED_HOSTS.has(parsed.hostname)) throw new Error('Host not allowed');

  const addresses = await dns.lookup(parsed.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new Error('Private network URLs are not allowed');
  }
  return parsed.href;
}

module.exports = { assertSafeUrl };
