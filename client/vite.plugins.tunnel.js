import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LT_META = path.join(ROOT, '.tunnel-url.json');
const PREFIX = '/__hush_lt';

const LOCAL_BASE = `http://127.0.0.1:${process.env.HUSH_TUNNEL_PORT || 3335}/`;

function readTunnelMeta() {
    try {
        const data = JSON.parse(fs.readFileSync(LT_META, 'utf8'));
        const url = (data?.locaLtUrl || data?.url || '').replace(/\/$/, '');
        return url || null;
    } catch {
        return null;
    }
}

function ltBypassHeaders(incoming = {}) {
    const headers = {
        'bypass-tunnel-reminder': 'true',
        accept: incoming.accept || '*/*',
    };
    if (incoming['accept-language']) headers['accept-language'] = incoming['accept-language'];
    if (incoming.cookie) headers.cookie = incoming.cookie;
    return headers;
}


function injectLocalBase(html) {
    const tag = `<base href="${LOCAL_BASE}">`;
    if (html.includes('<base ')) return html;
    if (html.includes('<head>')) return html.replace('<head>', `<head>${tag}`);
    if (html.includes('<head ')) return html.replace(/<head([^>]*)>/, `<head$1>${tag}`);
    return tag + html;
}


const LT_SW_SNIPPET = `<script>
if (location.hostname.endsWith('.loca.lt') && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    return Promise.all(regs.map(function (r) { return r.unregister(); }));
  }).then(function () {
    return navigator.serviceWorker.register('/hush-lt-sw.js');
  }).catch(function () {});
}
</script>`;

function injectLtServiceWorker(html) {
    if (html.includes('hush-lt-sw.js')) return html;
    if (html.includes('</head>')) return html.replace('</head>', `${LT_SW_SNIPPET}</head>`);
    return html + LT_SW_SNIPPET;
}

function rewriteHtmlIfNeeded(html, contentType, useLocalBase) {
    if (!contentType?.includes('text/html')) return html;
    let out = html;
    if (useLocalBase) out = injectLocalBase(out);
    else out = injectLtServiceWorker(out);
    return out;
}


export function tunnelProxyPlugin() {
    return {
        name: 'hush-tunnel-proxy',
        transformIndexHtml(html) {
            return injectLtServiceWorker(html);
        },
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = req.url || '';

                if (url === PREFIX) {
                    res.statusCode = 302;
                    res.setHeader('Location', `${PREFIX}/`);
                    res.end();
                    return;
                }

                if (!url.startsWith(PREFIX)) return next();

                const tunnelBase = readTunnelMeta();
                if (!tunnelBase) {
                    res.statusCode = 503;
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.end('Нет .tunnel-url.json — запустите npm run dev:public');
                    return;
                }

                const subPath = url.slice(PREFIX.length) || '/';
                const targetUrl = `${tunnelBase}${subPath.startsWith('/') ? subPath : `/${subPath}`}`;

                try {
                    const upstream = await fetch(targetUrl, {
                        method: req.method || 'GET',
                        headers: ltBypassHeaders(req.headers),
                    });

                    const contentType = upstream.headers.get('content-type') || '';
                    let body = Buffer.from(await upstream.arrayBuffer());

                    if (contentType.includes('text/html')) {
                        const text = body.toString('utf8');
                        body = Buffer.from(rewriteHtmlIfNeeded(text, contentType, true), 'utf8');
                    }

                    res.statusCode = upstream.status;
                    upstream.headers.forEach((value, key) => {
                        const k = key.toLowerCase();
                        if (k === 'transfer-encoding' || k === 'content-encoding' || k === 'content-length') return;
                        res.setHeader(key, value);
                    });
                    res.setHeader('Content-Length', String(body.length));
                    res.end(body);
                } catch (e) {
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.end(`Tunnel proxy error: ${e.message}`);
                }
            });
        },
    };
}
