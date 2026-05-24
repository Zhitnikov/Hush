
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (url.origin !== self.location.origin) return;
    if (!url.hostname.endsWith('.loca.lt')) return;

    if (
        url.pathname.startsWith('/api') ||
        url.pathname.startsWith('/socket.io') ||
        url.pathname.startsWith('/uploads')
    ) {
        return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return;
    }

    const headers = new Headers(request.headers);
    headers.set('bypass-tunnel-reminder', 'true');

    event.respondWith(fetch(new Request(request, { headers })));
});
