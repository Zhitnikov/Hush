import {
    enqueueOutgoing,
    listOutgoingQueue,
    dequeueOutgoing,
    getLocalMedia,
    metaKey,
} from './localMediaStore';
import { deliverEncryptedMedia } from './mediaTransfer';

export async function queueOutgoingMedia(item) {
    await enqueueOutgoing({
        ...item,
        createdAt: item.createdAt || new Date().toISOString(),
        attempts: item.attempts || 0,
    });
}

export async function processOutgoingMediaQueue(socket) {
    if (!socket?.connected) return { sent: 0, failed: 0 };

    const items = await listOutgoingQueue();
    let sent = 0;
    let failed = 0;

    for (const item of items) {
        try {
            const ciphertext = await getLocalMedia(item.transferId);
            const metaBlob = await getLocalMedia(metaKey(item.transferId));
            if (!ciphertext || !metaBlob) {
                await dequeueOutgoing(item.id);
                continue;
            }
            const meta = JSON.parse(await metaBlob.text());
            const bytes = new Uint8Array(await ciphertext.arrayBuffer());

            await deliverEncryptedMedia(socket, {
                target: item.target,
                transferId: item.transferId,
                ciphertext: bytes,
                meta,
                mime: item.mime || 'application/octet-stream',
            });

            await dequeueOutgoing(item.id);
            sent += 1;
        } catch (e) {
            console.warn('media queue item failed', item.id, e);
            failed += 1;
        }
    }

    return { sent, failed };
}

export { listOutgoingQueue, dequeueOutgoing };
