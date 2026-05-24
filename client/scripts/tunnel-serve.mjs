
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.HUSH_TUNNEL_PORT || 3335);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(ROOT, '..');
const VITE = path.join(CLIENT, 'node_modules', 'vite', 'bin', 'vite.js');
const NODE = process.execPath;

function run(args, label) {
    return new Promise((resolve, reject) => {
        console.log(`[tunnel-serve] ${label}…`);
        const child = spawn(NODE, ['--disable-warning=DEP0060', VITE, ...args], {
            cwd: CLIENT,
            stdio: 'inherit',
            shell: false,
        });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${label} exit ${code}`))));
        child.on('error', reject);
    });
}

await run(['build'], 'vite build');
console.log(`[tunnel-serve] preview http://127.0.0.1:${PORT} (для loca.lt)`);

const preview = spawn(
    NODE,
    ['--disable-warning=DEP0060', VITE, 'preview', '--port', String(PORT), '--host', '0.0.0.0', '--strictPort'],
    { cwd: CLIENT, stdio: 'inherit', shell: false }
);

preview.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => preview.kill());
