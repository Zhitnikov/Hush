
export function pickRecorderMimeType(withVideo) {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = withVideo
        ? [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4',
        ]
        : [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/ogg',
        ];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export function createMediaRecorder(stream, withVideo) {
    const mimeType = pickRecorderMimeType(withVideo);
    const options = mimeType ? { mimeType } : {};
    return new MediaRecorder(stream, options);
}


export function recordingUploadFile(mode, rawMime) {
    const base = (rawMime || '').split(';')[0].trim().toLowerCase() || (mode === 'video' ? 'video/webm' : 'audio/webm');
    if (mode === 'video') {
        return { filename: 'circle.webm', mime: base.startsWith('video/') ? base : 'video/webm' };
    }
    if (base === 'audio/ogg') return { filename: 'voice.ogg', mime: 'audio/ogg' };
    if (base === 'audio/mp4' || base === 'audio/m4a') return { filename: 'voice.m4a', mime: 'audio/mp4' };
    if (base === 'audio/mpeg') return { filename: 'voice.mp3', mime: 'audio/mpeg' };
    return { filename: 'voice.webm', mime: 'audio/webm' };
}
