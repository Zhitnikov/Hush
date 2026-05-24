
const DB_NAME = 'hush_media';
const DB_VERSION = 2;
const STORES = {
    blobs: 'blobs',
    queue: 'queue',
};

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains(STORES.blobs)) {
                db.createObjectStore(STORES.blobs);
            }
            if (!db.objectStoreNames.contains(STORES.queue)) {
                db.createObjectStore(STORES.queue, { keyPath: 'id' });
            }
        };
    });
}

export async function putLocalMedia(id, blob) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.blobs, 'readwrite');
        tx.objectStore(STORES.blobs).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getLocalMedia(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.blobs, 'readonly');
        const req = tx.objectStore(STORES.blobs).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function deleteLocalMedia(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.blobs, 'readwrite');
        tx.objectStore(STORES.blobs).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function listAllLocalMediaKeys() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.blobs, 'readonly');
        const req = tx.objectStore(STORES.blobs).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export function localMediaIdForMessage(messageId) {
    return `msg_${messageId}`;
}

export function previewKey(transferId) {
    return `${transferId}_preview`;
}

export function metaKey(transferId) {
    return `${transferId}_meta`;
}

export async function enqueueOutgoing(item) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.queue, 'readwrite');
        tx.objectStore(STORES.queue).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function listOutgoingQueue() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.queue, 'readonly');
        const req = tx.objectStore(STORES.queue).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export async function dequeueOutgoing(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.queue, 'readwrite');
        tx.objectStore(STORES.queue).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
