import { putLocalMedia, metaKey } from './localMediaStore';

const sessions = new Map();

export function handleMediaTransferStart(payload) {
    const { transferId, total, mime, cryptoMeta } = payload;
    if (!transferId) return;
    sessions.set(transferId, {
        chunks: new Array(total),
        total,
        mime,
        cryptoMeta,
    });
}

export async function handleMediaTransferChunk(payload) {
    const { transferId, index, total, data, mime, cryptoMeta } = payload;
    let session = sessions.get(transferId);
    if (!session) {
        session = { chunks: new Array(total), total, mime, cryptoMeta };
        sessions.set(transferId, session);
    }
    if (cryptoMeta) session.cryptoMeta = cryptoMeta;
    session.chunks[index] = data;
    if (session.chunks.filter(Boolean).length < total) return;

    try {
        const parts = session.chunks.map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        const merged = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let offset = 0;
        parts.forEach((p) => {
            merged.set(p, offset);
            offset += p.length;
        });

        await putLocalMedia(transferId, new Blob([merged], { type: 'application/octet-stream' }));
        if (session.cryptoMeta) {
            await putLocalMedia(metaKey(transferId), new Blob([JSON.stringify(session.cryptoMeta)], { type: 'application/json' }));
        }

        window.dispatchEvent(new CustomEvent('hush-media-ready', { detail: { transferId } }));
    } catch (e) {
        console.error('media receive failed', e);
    } finally {
        sessions.delete(transferId);
    }
}

export function clearMediaSessions() {
    sessions.clear();
}
