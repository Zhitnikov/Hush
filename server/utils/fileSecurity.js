const path = require('path');
const crypto = require('crypto');
const { ALLOWED_UPLOAD_EXT, ALLOWED_UPLOAD_MIMES } = require('../config/constants');

const MAGIC = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

function safeFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  if (!ALLOWED_UPLOAD_EXT.includes(ext)) return null;
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

function mimeFromExt(ext, declaredMime = '') {
  const declared = normalizeMime(declaredMime);
  if (ext === '.webm') {
    if (declared.startsWith('audio/')) return declared;
    return 'video/webm';
  }
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
  };
  return map[ext] || null;
}

function sniffMime(buffer) {
  for (const { mime, bytes } of MAGIC) {
    if (buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b)) return mime;
  }
  return null;
}

function normalizeMime(mime) {
  if (!mime) return '';
  return String(mime).split(';')[0].trim().toLowerCase();
}

function validateUploadedFile(file) {
  if (!file) return { ok: false, msg: 'No file' };
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_UPLOAD_EXT.includes(ext)) return { ok: false, msg: 'Extension not allowed' };

  const declared = normalizeMime(file.mimetype);
  const expected = mimeFromExt(ext, file.mimetype);
  if (!ALLOWED_UPLOAD_MIMES.includes(declared)) return { ok: false, msg: 'MIME not allowed' };
  if (expected && declared !== expected) {
    const sameFamily = declared.split('/')[0] === expected.split('/')[0];
    const webmVoice = ext === '.webm' && declared.startsWith('audio/');
    if (!sameFamily && !webmVoice) return { ok: false, msg: 'MIME mismatch' };
  }

  const buf = file.buffer || (file.path ? null : null);
  if (buf && buf.length >= 4) {
    const sniffed = sniffMime(buf);
    if (sniffed && sniffed !== declared && !['video/webm', 'audio/webm', 'audio/ogg'].includes(declared)) {
      return { ok: false, msg: 'File content does not match type' };
    }
  }
  return { ok: true };
}

function uploadsFilePath(fileUrl, uploadsDir) {
  const name = path.basename(fileUrl || '');
  if (!name || name.includes('..')) return null;
  return path.join(uploadsDir, name);
}

module.exports = { safeFilename, validateUploadedFile, uploadsFilePath, mimeFromExt };
