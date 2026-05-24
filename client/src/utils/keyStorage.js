const DB_NAME = 'hush-keys';
const STORE = 'keys';
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPayload(payload, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(cipher))),
  };
}

async function decryptPayload(bundle, passphrase) {
  const salt = Uint8Array.from(atob(bundle.salt), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(bundle.iv), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(bundle.data), (c) => c.charCodeAt(0));
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function saveKeys(keys, userId, passphrase) {
  const db = await openDb();
  const wrapped = passphrase
    ? await encryptPayload(keys, passphrase)
    : { plain: keys };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ wrapped, userId, at: Date.now() }, userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKeys(userId, passphrase) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(userId);
    req.onsuccess = async () => {
      const row = req.result;
      if (!row) {
        resolve(null);
        return;
      }
      try {
        if (row.wrapped?.plain) resolve(row.wrapped.plain);
        else if (row.wrapped && passphrase) resolve(await decryptPayload(row.wrapped, passphrase));
        else resolve(null);
      } catch (e) {
        console.warn('Key decrypt failed', e);
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearKeys(userId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function migrateFromLocalStorage(userId) {
  try {
    const raw = localStorage.getItem('chat_keys');
    if (!raw) return null;
    const keys = JSON.parse(raw);
    localStorage.removeItem('chat_keys');
    return keys;
  } catch {
    return null;
  }
}
