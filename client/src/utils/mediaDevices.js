
export function canUseMediaDevices() {
    if (typeof window === 'undefined') return false;
    if (!window.isSecureContext) return false;
    return Boolean(navigator.mediaDevices?.getUserMedia);
}

export function getMediaUnavailableReason() {
    if (typeof window === 'undefined') return 'Медиа недоступны в этой среде.';
    if (!window.isSecureContext) {
        return 'Камера и микрофон доступны только по HTTPS или на localhost. Откройте приложение через https://… или http://localhost:3333.';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        return 'Браузер не поддерживает доступ к камере и микрофону.';
    }
    return 'Не удалось получить доступ к камере или микрофону.';
}

export async function requestUserMedia(constraints) {
    if (!canUseMediaDevices()) {
        throw new Error(getMediaUnavailableReason());
    }
    return navigator.mediaDevices.getUserMedia(constraints);
}
