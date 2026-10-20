import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Gelistirme sunucusu (HMR) ayarlari.
 *
 * Vite dev sunucusu arayuzu kendisi sunar; API istekleri `/api` onekinde
 * yerel CLICleaner sunucusuna (varsayilan 127.0.0.1:4321) aktarilir.
 * Boylece arayuzde yapilan her degisiklik tarayicida aninda gorulur;
 * API tarafi degismez.
 */
const apiTarget = process.env.CLICLEANER_API ?? 'http://127.0.0.1:4321';

export default defineConfig({
  root: resolve(root, 'web'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(root, 'dist', 'web'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        // Host basligi degistirilmez: arka uc kendi host kontrolunu yapar
        // (yalnizca loopback kabul edilir).
        changeOrigin: false,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Arka uc "Origin == Host" kontrolu yapar. Tarayici ayni
            // kaynakli isteklerde Origin'i gonderir; proxy'de Host ile
            // esitlendiginde kontrol gecer.
            const host = req.headers.host;
            if (host) proxyReq.setHeader('origin', `http://${host}`);
          });
        },
      },
    },
  },
});
