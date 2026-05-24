
export function hasPoll(msg) {
    const p = msg?.poll;
    if (!p || typeof p !== 'object') return false;
    const question = String(p.question || '').trim();
    const options = Array.isArray(p.options)
        ? p.options.filter((o) => o && String(o.text || '').trim())
        : [];
    return Boolean(question) || options.length > 0;
}


export function messagePreviewLabel(msg, decryptedText = '') {
    if (!msg) return '';
    if (msg.isDeleted) return 'Сообщение удалено';
    if (msg.isAudio || msg.fileType === 'audio') return 'Голосовое сообщение';
    if (msg.isVideoCircle) return 'Видеосообщение';
    if (msg.fileType === 'video' && !msg.isVideoCircle) return 'Видео';
    if (msg.fileType === 'image') return 'Фото';
    if (msg.fileUrl || msg.fileType === 'document') return 'Файл';

    const text = String(decryptedText || '').trim();
    if (text) return text.length > 56 ? `${text.slice(0, 56)}…` : text;

    if (hasPoll(msg)) return 'Опрос';
    if (msg.content) return 'Сообщение';
    return '';
}
