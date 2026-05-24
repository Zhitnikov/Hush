
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');

if (!fs.existsSync(nm)) {
    console.log('[clean-vite-cache] node_modules not found, skip');
    process.exit(0);
}

const removed = [];
for (const name of fs.readdirSync(nm)) {
    if (name === '.vite' || name.startsWith('.vite-')) {
        const full = path.join(nm, name);
        fs.rmSync(full, { recursive: true, force: true });
        removed.push(name);
    }
}

if (removed.length) {
    console.log('[clean-vite-cache] removed:', removed.join(', '));
} else {
    console.log('[clean-vite-cache] nothing to remove');
}
