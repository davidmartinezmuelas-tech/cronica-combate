/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH permite publicar en una subruta (p. ej. GitHub Pages: /cronica-combate/).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  // el worker de la física de los dados se empaqueta como módulo
  worker: { format: 'es' },
  // la escena 3D (three.js) es un trozo aparte que solo se descarga al usar los dados
  build: {
    chunkSizeWarningLimit: 700,
    // Firebase (cuentas y salas) va en su propio trozo: solo se descarga al iniciar sesión
    rollupOptions: { output: { manualChunks: (id) => (/node_modules[\\/](@firebase|firebase)[\\/]/.test(id) ? 'firebase' : undefined) } },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}', 'data/*.json'],
        // sin conexión no sirve de nada: no se precarga para todos
        globIgnores: ['**/firebase-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Crónica de Combate',
        short_name: 'Crónica',
        description: 'Gestor de combate para la 5.ª edición (2024).',
        lang: 'es',
        theme_color: '#2a2119',
        background_color: '#2a2119',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
