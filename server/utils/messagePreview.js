function hasPoll(msg) {
  const p = msg?.poll;
  if (!p || typeof p !== 'object') return false;
  const question = String(p.question || '').trim();
  const options = Array.isArray(p.options)
    ? p.options.filter((o) => o && String(o.text || '').trim())
    : [];
  return Boolean(question) || options.length > 0;
}

function lastMessagePreviewFromDoc(msg) {
  if (!msg) return null;
  if (msg.isDeleted) return 'Сообщение удалено';
  if (msg.isAudio || msg.fileType === 'audio') return 'Голосовое сообщение';
  if (msg.isVideoCircle) return 'Видеосообщение';
  if (msg.fileType === 'video') return 'Видео';
  if (msg.fileType === 'image') return 'Фото';
  if (msg.fileUrl || msg.fileType === 'document') return 'Файл';
  if (hasPoll(msg)) return 'Опрос';
  if (msg.content) return 'Сообщение';
  return null;
}

module.exports = { lastMessagePreviewFromDoc, hasPoll };
