
async function importPublicKey(spkiB64) {
    const binary = new Uint8Array(atob(spkiB64).split('').map((c) => c.charCodeAt(0)));
    return window.crypto.subtle.importKey('spki', binary.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
}

async function importPrivateKey(pkcs8B64) {
    const binary = new Uint8Array(atob(pkcs8B64).split('').map((c) => c.charCodeAt(0)));
    return window.crypto.subtle.importKey('pkcs8', binary.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
}

function u8ToB64(bytes) {
    return btoa(String.fromCharCode(...bytes));
}

function b64ToU8(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encryptMediaBuffer(arrayBuffer, { recipientPublicKey, groupKeyB64, senderPublicKey }) {
    let aesKey;
    const encryptedKeys = {};

    if (groupKeyB64) {
        const rawKey = b64ToU8(groupKeyB64);
        aesKey = await window.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    } else {
        aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
        const rsaRecipient = await importPublicKey(recipientPublicKey);
        const encForRecipient = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaRecipient, exportedAesKey);
        encryptedKeys[recipientPublicKey] = u8ToB64(new Uint8Array(encForRecipient));
        if (senderPublicKey) {
            const rsaSender = await importPublicKey(senderPublicKey);
            const encForSender = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaSender, exportedAesKey);
            encryptedKeys[senderPublicKey] = u8ToB64(new Uint8Array(encForSender));
        }
    }

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plain = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : arrayBuffer;
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plain);

    const meta = {
        iv: u8ToB64(iv),
        e2ee: true,
        isGroup: Boolean(groupKeyB64),
        keys: Object.keys(encryptedKeys).length ? encryptedKeys : undefined,
    };

    return { ciphertext: new Uint8Array(encrypted), meta };
}

export async function decryptMediaBuffer(ciphertext, meta, myPrivateKeyB64, groupKeyB64, myPublicKeyB64) {
    if (!meta?.e2ee) {
        return ciphertext instanceof ArrayBuffer ? ciphertext : ciphertext.buffer;
    }

    let aesKey;
    if (meta.isGroup) {
        if (!groupKeyB64) throw new Error('no group key');
        const rawKey = b64ToU8(groupKeyB64);
        aesKey = await window.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    } else {
        const rsaKey = await importPrivateKey(myPrivateKeyB64);
        let encryptedAesKeyB64 = null;
        if (meta.keys) {
            if (myPublicKeyB64 && meta.keys[myPublicKeyB64]) encryptedAesKeyB64 = meta.keys[myPublicKeyB64];
            else if (!myPublicKeyB64 || Object.keys(meta.keys).length === 1) encryptedAesKeyB64 = Object.values(meta.keys)[0];
        }
        if (!encryptedAesKeyB64) throw new Error('no media key');
        const encryptedAesKey = b64ToU8(encryptedAesKeyB64);
        const aesKeyRaw = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsaKey, encryptedAesKey);
        aesKey = await window.crypto.subtle.importKey('raw', aesKeyRaw, { name: 'AES-GCM' }, false, ['decrypt']);
    }

    const iv = b64ToU8(meta.iv);
    const bytes = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, bytes);
    return decrypted;
}
