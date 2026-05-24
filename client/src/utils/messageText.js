import { decryptMessage } from './crypto';
import { messagePreviewLabel } from './messagePreview';

export async function decryptMessageContent(content, myPrivKey, groupKey, myPubKey) {
    if (!content || !myPrivKey) return content ?? '';
    try {
        return await decryptMessage(content, myPrivKey, groupKey, myPubKey);
    } catch {
        return '…';
    }
}

export async function enrichMessage(msg, myPrivKey, groupKey, myPubKey) {
    const content = await decryptMessageContent(msg.content, myPrivKey, groupKey, myPubKey);
    let replyTo = msg.replyTo;
    if (replyTo?.content) {
        const replyText = await decryptMessageContent(replyTo.content, myPrivKey, groupKey, myPubKey);
        replyTo = { ...replyTo, content: replyText, preview: messagePreviewLabel(replyTo, replyText) };
    }
    return {
        ...msg,
        content,
        isEncrypted: content !== msg.content,
        pendingDecrypt: false,
        replyTo,
    };
}

export function replyPreviewText(msg) {
    if (!msg) return '';
    if (msg.replyTo?.preview) return msg.replyTo.preview;
    if (msg.replyTo?.content && !String(msg.replyTo.content).trim().startsWith('{')) {
        return msg.replyTo.content;
    }
    return messagePreviewLabel(msg.replyTo || {});
}
