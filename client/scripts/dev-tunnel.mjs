
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const DEV_PORT = Number(process.env.HUSH_HTTP_PORT || 3333);
const TUNNEL_PORT = Number(process.env.HUSH_TUNNEL_PORT || 3335);
const HTTPS_PORT = Number(process.env.HUSH_HTTPS_PORT || 3443);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TUNNEL_META = path.join(ROOT, '..', '.tunnel-url.json');
const RAW =
    process.env.HUSH_TUNNEL ||
    process.argv.find((a) => a.startsWith('--provider='))?.split('=')[1] ||
    'https';
const PROVIDER = { lt: 'https', public: 'https' }[RAW.toLowerCase()] || RAW.toLowerCase();

function waitForHttp(port, attempts = 180) {
    return new Promise((resolve, reject) => {
        let n = 0;
        const tick = () => {
            const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 3000 }, (res) => {
                res.resume();
                resolve();
            });
            req.on('error', () => {
                n += 1;
                if (n >= attempts) reject(new Error(`Порт ${port} не отвечает (ждали preview-сборку?)`));
                else setTimeout(tick, 1000);
            });
            req.on('timeout', () => {
                req.destroy();
                n += 1;
                if (n >= attempts) reject(new Error('timeout'));
                else setTimeout(tick, 1000);
            });
        };
        tick();
    });
}

function waitForHttps(port, attempts = 120) {
    return new Promise((resolve, reject) => {
        let n = 0;
        const tick = () => {
            const req = https.get(
                { host: '127.0.0.1', port, path: '/', timeout: 3000, rejectUnauthorized: false },
                (res) => {
                    res.resume();
                    resolve();
                }
            );
            req.on('error', () => {
                n += 1;
                if (n >= attempts) reject(new Error(`HTTPS :${port} не ответил`));
                else setTimeout(tick, 500);
            });
        };
        tick();
    });
}

function writeTunnelMeta(meta) {
    fs.writeFileSync(
        TUNNEL_META,
        JSON.stringify({ ...meta, tunnelPort: TUNNEL_PORT, at: new Date().toISOString() }, null, 2)
    );
}

function spawnCli(command, args, { pipe = false } = {}) {
    const stdio = pipe ? ['ignore', 'pipe', 'pipe'] : 'inherit';
    if (process.platform === 'win32') {
        const line = [command, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
        return spawn('cmd.exe', ['/d', '/s', '/c', line], { stdio, windowsHide: true });
    }
    return spawn(command, args, { stdio });
}

function spawnNpx(args, opts) {
    return spawnCli('npx', ['-y', ...args], opts);
}

async function fetchLtPassword() {
    try {
        const r = await fetch('https://loca.lt/mytunnelpassword', { signal: AbortSignal.timeout(8000) });
        const t = (await r.text()).trim();
        if (t) console.log('[tunnel] Пароль loca.lt (если попросят):', t);
    } catch {
        
    }
}

function printHelp(ltUrl, provider) {
    console.log('\n[tunnel] ═══════════════════════════════════════');
    console.log(`[tunnel] ${provider} → preview :${TUNNEL_PORT}`);
    console.log('[tunnel] Публичный HTTPS:', ltUrl);
    console.log(`[tunnel] ПК без формы IP:  http://127.0.0.1:${DEV_PORT}/__hush_lt/`);
    console.log('[tunnel] ───────────────────────────────────────');
    console.log(`[tunnel] Dev (HMR):      http://127.0.0.1:${DEV_PORT}`);
    console.log(`[tunnel] Wi‑Fi HTTPS:      https://<IP-ПК>:${HTTPS_PORT}`);
    console.log('[tunnel] loca.lt: введите IP **с их страницы**, не свой домашний.');
    console.log('[tunnel] После правок кода — перезапустите npm run dev:public');
    console.log('[tunnel] Альтернатива:     set HUSH_TUNNEL=run');
    console.log('[tunnel] ═══════════════════════════════════════\n');
}

async function startLocaltunnel({ port, localHttps = false }) {
    const { default: localtunnel } = await import('localtunnel');
    return localtunnel({
        port,
        local_host: '127.0.0.1',
        local_https: localHttps,
        allow_invalid_cert: localHttps,
    });
}

async function runLocaltunnelLoop({ port, localHttps, provider }) {
    let active = null;
    let shuttingDown = false;

    const connect = async () => {
        if (shuttingDown) return;
        try {
            const tunnel = await startLocaltunnel({ port, localHttps });
            active = tunnel;
            const url = tunnel.url;
            writeTunnelMeta({ url, locaLtUrl: url, provider });
            printHelp(url, provider);
            await fetchLtPassword();

            tunnel.on('error', (err) => {
                console.error('[tunnel] Ошибка:', err.message);
            });

            tunnel.on('close', () => {
                if (shuttingDown) return;
                console.warn('[tunnel] Соединение потеряно — переподключение через 3 с…');
                setTimeout(connect, 3000);
            });
        } catch (err) {
            console.error('[tunnel]', err.message);
            if (!shuttingDown) setTimeout(connect, 5000);
        }
    };

    await connect();

    const stop = () => {
        shuttingDown = true;
        try {
            fs.unlinkSync(TUNNEL_META);
        } catch {
            
        }
        active?.close();
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

function runLocalhostRun() {
    console.log('\n[tunnel] localhost.run (ssh)\n');
    const child = spawnCli('ssh', [
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        process.platform === 'win32' ? 'UserKnownHostsFile=NUL' : 'UserKnownHostsFile=/dev/null',
        '-R',
        `80:127.0.0.1:${TUNNEL_PORT}`,
        'nokey@localhost.run',
    ]);
    child.on('exit', (code) => process.exit(code ?? 0));
}

function runCf() {
    const child = spawnNpx(['cloudflared', 'tunnel', '--url', `http://127.0.0.1:${TUNNEL_PORT}`], { pipe: true });
    let resolved = false;
    const onData = (chunk) => {
        const text = chunk.toString();
        process.stderr.write(text);
        const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (m && !resolved) {
            resolved = true;
            writeTunnelMeta({ url: m[0], provider: 'cf' });
            printHelp(m[0], 'cf');
        }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
        if (!resolved) process.exit(code ?? 1);
    });
    process.on('SIGINT', () => child.kill());
}

function runBore() {
    const child = spawnNpx(['bore-cli', 'local', String(TUNNEL_PORT), '--to', 'bore.pub']);
    child.on('exit', (code) => process.exit(code ?? 0));
}

if (PROVIDER === 'lt3443') {
    await waitForHttps(HTTPS_PORT);
    await runLocaltunnelLoop({ port: HTTPS_PORT, localHttps: true, provider: 'lt3443' });
} else if (PROVIDER === 'https' || PROVIDER === 'lt' || PROVIDER === 'public') {
    console.log(`[tunnel] Ждём preview на :${TUNNEL_PORT}…`);
    await waitForHttp(TUNNEL_PORT);
    await runLocaltunnelLoop({ port: TUNNEL_PORT, localHttps: false, provider: 'loca.lt' });
} else if (PROVIDER === 'run') {
    await waitForHttp(TUNNEL_PORT);
    runLocalhostRun();
} else if (PROVIDER === 'cf') {
    await waitForHttp(TUNNEL_PORT);
    runCf();
} else if (PROVIDER === 'bore') {
    await waitForHttp(TUNNEL_PORT);
    runBore();
} else {
    console.error(`[tunnel] Неизвестный HUSH_TUNNEL=${RAW}`);
    process.exit(1);
}
