import { assertSecureCrypto } from './cryptoEnvironment';

export async function generateKeyPair() {
    assertSecureCrypto();
    const subtle = globalThis.crypto.subtle;
    const keyPair = await subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['encrypt', 'decrypt']
    );
    return {
        publicKey: btoa(String.fromCharCode(...new Uint8Array(await subtle.exportKey('spki', keyPair.publicKey)))),
        privateKey: btoa(String.fromCharCode(...new Uint8Array(await subtle.exportKey('pkcs8', keyPair.privateKey)))),
    };
}

async function importPublicKey(spkiB64) {
    try {
        const binary = new Uint8Array(atob(spkiB64).split('').map(c => c.charCodeAt(0)));
        return await window.crypto.subtle.importKey('spki', binary.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
    } catch (e) {
        console.error('Import public key failed', e);
        throw e;
    }
}

async function importPrivateKey(pkcs8B64) {
    try {
        const binary = new Uint8Array(atob(pkcs8B64).split('').map(c => c.charCodeAt(0)));
        return await window.crypto.subtle.importKey('pkcs8', binary.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
    } catch (e) {
        console.error('Import private key failed', e);
        throw e;
    }
}

export async function generateGroupKey() {
    const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = await window.crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function encryptGroupKey(groupKeyB64, userPublicKeyB64) {
    const rsaKey = await importPublicKey(userPublicKeyB64);
    const rawGroupKey = new Uint8Array(atob(groupKeyB64).split('').map(c => c.charCodeAt(0)));
    const encrypted = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, rawGroupKey);
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

export async function decryptGroupKey(encryptedKeyB64, myPrivateKeyB64) {
    const rsaKey = await importPrivateKey(myPrivateKeyB64);
    const binary = new Uint8Array(atob(encryptedKeyB64).split('').map(c => c.charCodeAt(0)));
    const decrypted = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsaKey, binary);
    return btoa(String.fromCharCode(...new Uint8Array(decrypted)));
}

export async function encryptMessage(text, recipientPublicKeyB64, existingAesKeyB64 = null, senderPublicKeyB64 = null) {
    try {
        let aesKey;
        const encryptedKeys = {};

        if (existingAesKeyB64) {
            const rawKey = new Uint8Array(atob(existingAesKeyB64).split('').map(c => c.charCodeAt(0)));
            aesKey = await window.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt']);
        } else {
            aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
            const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

            const rsaRecipient = await importPublicKey(recipientPublicKeyB64);
            const encForRecipient = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaRecipient, exportedAesKey);
            encryptedKeys[recipientPublicKeyB64] = btoa(String.fromCharCode(...new Uint8Array(encForRecipient)));

            if (senderPublicKeyB64) {
                const rsaSender = await importPublicKey(senderPublicKeyB64);
                const encForSender = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaSender, exportedAesKey);
                encryptedKeys[senderPublicKeyB64] = btoa(String.fromCharCode(...new Uint8Array(encForSender)));
            }
        }

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedContent = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(text));

        return JSON.stringify({
            keys: encryptedKeys,
            iv: btoa(String.fromCharCode(...iv)),
            content: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
            e2ee: true,
            isGroup: !!existingAesKeyB64
        });
    } catch (e) {
        console.error('Encryption failed', e);
        throw new Error('Encryption failed — message not sent');
    }
}

export async function decryptMessage(encryptedJson, myPrivateKeyB64, groupAesKeyB64 = null, myPublicKeyB64 = null) {
    try {
        if (!encryptedJson || typeof encryptedJson !== 'string' || !encryptedJson.startsWith('{')) {
            return encryptedJson;
        }

        const data = JSON.parse(encryptedJson);
        if (!data.e2ee) return encryptedJson;

        let aesKey;
        if (data.isGroup) {
            if (!groupAesKeyB64) return '[Encrypted Group Message]';
            const rawKey = new Uint8Array(atob(groupAesKeyB64).split('').map(c => c.charCodeAt(0)));
            aesKey = await window.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, true, ['decrypt']);
        } else {
            const rsaKey = await importPrivateKey(myPrivateKeyB64);

            let encryptedAesKeyB64 = null;
            if (data.keys) {
                if (myPublicKeyB64 && data.keys[myPublicKeyB64]) {
                    encryptedAesKeyB64 = data.keys[myPublicKeyB64];
                } else if (!myPublicKeyB64 || Object.keys(data.keys).length === 1) {
                    encryptedAesKeyB64 = Object.values(data.keys)[0];
                }
            } else if (data.key) {
                encryptedAesKeyB64 = data.key;
            }

            if (!encryptedAesKeyB64) return '[Locked Content]';

            const encryptedAesKey = new Uint8Array(atob(encryptedAesKeyB64).split('').map(c => c.charCodeAt(0)));
            const aesKeyRaw = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsaKey, encryptedAesKey);
            aesKey = await window.crypto.subtle.importKey('raw', aesKeyRaw, { name: 'AES-GCM' }, true, ['decrypt']);
        }

        const iv = new Uint8Array(atob(data.iv).split('').map(c => c.charCodeAt(0)));
        const content = new Uint8Array(atob(data.content).split('').map(c => c.charCodeAt(0)));
        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, content);

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.warn('Decryption failed', e);
        return '[Locked Content]';
    }
}
