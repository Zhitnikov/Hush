import { generateKeyPair } from './crypto';
import { saveKeys, loadKeys, migrateFromLocalStorage } from './keyStorage';
import { assertSecureCrypto, isSecureCryptoAvailable, SecureCryptoRequiredError } from './cryptoEnvironment';

const sessionKey = (userId) => `hush_session_keys_${userId}`;

function readSessionKeys(userId) {
    try {
        const raw = sessionStorage.getItem(sessionKey(userId));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeSessionKeys(userId, keys) {
    try {
        sessionStorage.setItem(sessionKey(userId), JSON.stringify(keys));
    } catch {
        
    }
}


export async function ensureUserKeys(userId) {
    if (!userId) return { keys: null, error: null };

    if (!isSecureCryptoAvailable()) {
        return {
            keys: null,
            error: new SecureCryptoRequiredError(
                'Создание ключей возможно только в secure context (HTTPS / localhost).',
                null
            ),
        };
    }

    const migrated = migrateFromLocalStorage(userId);
    if (migrated?.privateKey && migrated?.publicKey) {
        writeSessionKeys(userId, migrated);
        await saveKeys(migrated, userId).catch(() => {});
        return { keys: migrated, error: null };
    }

    const session = readSessionKeys(userId);
    if (session?.privateKey && session?.publicKey) {
        return { keys: session, error: null };
    }

    try {
        const passphrase = sessionStorage.getItem(`key_pass_${userId}`) || '';
        let keys = null;
        try {
            keys = await loadKeys(userId, passphrase);
        } catch (e) {
            console.warn('loadKeys failed', e);
        }

        if (!keys?.privateKey || !keys?.publicKey) {
            assertSecureCrypto();
            keys = await generateKeyPair();
            await saveKeys(keys, userId, passphrase || undefined);
        }

        writeSessionKeys(userId, keys);
        return { keys, error: null };
    } catch (e) {
        if (e instanceof SecureCryptoRequiredError) {
            return { keys: null, error: e };
        }
        console.error('ensureUserKeys failed', e);
        return { keys: null, error: e };
    }
}
