
export function waitIceGatheringComplete(pc, timeoutMs = 6000) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            pc.removeEventListener('icegatheringstatechange', onChange);
            clearTimeout(timer);
            resolve();
        };
        const onChange = () => {
            if (pc.iceGatheringState === 'complete') done();
        };
        pc.addEventListener('icegatheringstatechange', onChange);
        const timer = setTimeout(done, timeoutMs);
    });
}

export function toSessionDescription(desc) {
    if (!desc) return null;
    if (desc instanceof RTCSessionDescription) return desc;
    return new RTCSessionDescription(desc);
}

export const DEFAULT_ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 4,
};
