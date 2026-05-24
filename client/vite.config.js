import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createDevProxy, createDevServer, viteCacheDir } from './vite.shared.js';
import { tunnelProxyPlugin } from './vite.plugins.tunnel.js';


const previewPort = Number(process.env.HUSH_TUNNEL_PORT || 3335);

export default defineConfig({
    cacheDir: viteCacheDir('http'),
    plugins: [react(), tunnelProxyPlugin()],
    server: createDevServer({
        port: 3333,
        proxy: createDevProxy(),
    }),
    preview: createDevServer({
        port: previewPort,
        proxy: createDevProxy(),
    }),
});
