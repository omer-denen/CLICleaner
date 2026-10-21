import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Tarayici arayuzu derlemesi.
 *
 * Cikti `dist/web` — npm paketine girer ve `residue ui --web` tarafindan
 * sunulur. Kaynak haritasi kapali (paket boyutu + yol sizintisi).
 */
export default defineConfig({
  root: 'web',
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    sourcemap: false,
  },
});
