
import { listAllLocalMediaKeys, getLocalMedia, putLocalMedia } from './localMediaStore';

export async function exportMediaBackup() {
    const keys = await listAllLocalMediaKeys();
    const entries = [];

    for (const key of keys) {
        const blob = await getLocalMedia(key);
        if (!blob) continue;
        const buf = await blob.arrayBuffer();
        entries.push({
            key: String(key),
            mime: blob.type,
            data: btoa(String.fromCharCode(...new Uint8Array(buf))),
        });
    }

    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        entries,
    };

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hush-media-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export async function importMediaBackup(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload?.entries?.length) throw new Error('Пустой бэкап');

    for (const entry of payload.entries) {
        const bytes = Uint8Array.from(atob(entry.data), (c) => c.charCodeAt(0));
        await putLocalMedia(entry.key, new Blob([bytes], { type: entry.mime || 'application/octet-stream' }));
    }

    return payload.entries.length;
}
