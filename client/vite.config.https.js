import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createDevProxy, createDevServer, viteCacheDir } from './vite.shared.js';


export default defineConfig({
    cacheDir: viteCacheDir('https'),
    plugins: [react(), basicSsl()],
    server: createDevServer({
        port: 3443,
        https: true,
        proxy: createDevProxy(),
    }),
});
