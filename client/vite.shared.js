
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';


export const TUNNEL_ALLOWED_HOSTS = [
    '.loca.lt',
    '.localtunnel.me',
    '.localhost.run',
    '.trycloudflare.com',
    '.lhr.life',
];


export function createDevServer(extra = {}) {
    const port = extra.port ?? 3333;
    const useHttps = Boolean(extra.https);

    return {
        host: '0.0.0.0',
        strictPort: true,
        allowedHosts: process.env.HUSH_ALLOW_ALL_HOSTS === '1' ? true : TUNNEL_ALLOWED_HOSTS,

        hmr: useHttps ? false : true,
        ...extra,
    };
}

export function createDevProxy() {
    return {
        '/api': {
            target: API_TARGET,
            changeOrigin: true,
        },
        '/uploads': {
            target: API_TARGET,
            changeOrigin: true,
        },
        '/socket.io': {
            target: API_TARGET,
            ws: true,
            changeOrigin: true,
            configure: (proxy) => {
                proxy.on('error', (err, _req, res) => {
                    if (err?.code === 'ECONNRESET' || err?.code === 'ECONNREFUSED') {
                        if (res && typeof res.end === 'function' && !res.writableEnded) {
                            try { res.end(); } catch {  }
                        }
                        return;
                    }
                    console.warn('[vite] socket.io proxy:', err.message);
                });
                proxy.on('close', () => {});
            },
        },
    };
}

export { API_TARGET };


export function viteCacheDir(id) {
    return `node_modules/.vite-${id}`;
}
