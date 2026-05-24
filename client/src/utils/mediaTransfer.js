import { putLocalMedia, localMediaIdForMessage, metaKey, previewKey } from './localMediaStore';
import { encryptMediaBuffer, decryptMediaBuffer } from './mediaCrypto';
import { queueOutgoingMedia } from './mediaQueue';

const CHUNK_SIZE = 32 * 1024;

function u8ToB64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function buildTarget({ chatType, chatId }) {
    if (chatType === 'channel') {
        return { isChannel: true, channelId: String(chatId), to: null };
    }
    return { isChannel: false, channelId: null, to: String(chatId) };
}


export async function deliverEncryptedMedia(socket, { target, transferId, ciphertext, meta, mime }) {
    if (!socket?.connected) throw new Error('socket offline');

    const bytes = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext);
    const total = Math.ceil(bytes.length / CHUNK_SIZE) || 1;
    const room = target.isChannel ? String(target.channelId) : String(target.to);

    socket.emit('media_transfer_start', {
        to: room,
        isChannel: Boolean(target.isChannel),
        channelId: target.channelId,
        transferId,
        total,
        mime: mime || 'application/octet-stream',
        size: bytes.length,
        cryptoMeta: meta,
    });

    for (let index = 0; index < total; index += 1) {
        const slice = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        socket.emit('media_transfer_chunk', {
            to: room,
            isChannel: Boolean(target.isChannel),
            channelId: target.channelId,
            transferId,
            index,
            total,
            data: u8ToB64(slice),
            mime,
        });
        await new Promise((r) => setTimeout(r, 0));
    }

    socket.emit('media_transfer_end', {
        to: room,
        isChannel: Boolean(target.isChannel),
        channelId: target.channelId,
        transferId,
    });
}


export async function sendChatAttachment({
    socket,
    chatType,
    chatId,
    file,
    fileType,
    cryptoContext,
    peerOnline = true,
}) {
    const transferId = crypto.randomUUID();
    const buffer = await file.arrayBuffer();
    const { ciphertext, meta } = await encryptMediaBuffer(buffer, cryptoContext);

    meta.mime = file.type || meta.mime;

    await putLocalMedia(transferId, new Blob([ciphertext], { type: 'application/octet-stream' }));
    await putLocalMedia(metaKey(transferId), new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    await putLocalMedia(previewKey(transferId), file);

    const target = buildTarget({ chatType, chatId });

    const trySend = peerOnline && socket?.connected;

    if (trySend) {
        try {
            await deliverEncryptedMedia(socket, {
                target,
                transferId,
                ciphertext,
                meta,
                mime: file.type,
            });
        } catch (e) {
            await queueOutgoingMedia({
                id: transferId,
                transferId,
                target,
                mime: file.type,
                fileType,
                chatType,
                chatId: String(chatId),
            });
        }
    } else {
        await queueOutgoingMedia({
            id: transferId,
            transferId,
            target,
            mime: file.type,
            fileType,
            chatType,
            chatId: String(chatId),
        });
    }

    return {
        fileUrl: `local://${transferId}`,
        fileType,
    };
}

export async function decryptAndStoreIncoming(transferId, encryptedBytes, cryptoMeta, mime, keys) {
    const decrypted = await decryptMediaBuffer(
        encryptedBytes,
        cryptoMeta,
        keys.privateKey,
        keys.groupKey,
        keys.publicKey,
    );
    const blob = new Blob([decrypted], { type: cryptoMeta?.mime || mime || 'application/octet-stream' });
    await putLocalMedia(transferId, blob);
    await putLocalMedia(metaKey(transferId), new Blob([JSON.stringify(cryptoMeta)], { type: 'application/json' }));
    return blob;
}

export async function cacheMessageMedia(messageId, blob) {
    await putLocalMedia(localMediaIdForMessage(messageId), blob);
}

export async function migrateServerMediaToLocal(messageId, url) {
    try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return null;
        const blob = await res.blob();
        await putLocalMedia(localMediaIdForMessage(messageId), blob);
        return blob;
    } catch {
        return null;
    }
}

export { localMediaIdForMessage, metaKey, previewKey, decryptMediaBuffer };
