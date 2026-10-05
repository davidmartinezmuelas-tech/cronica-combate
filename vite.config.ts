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
  build: { chunkSizeWarningLimit: 600 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}', 'data/*.json'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Crónica de Combate',
        short_name: 'Crónica',
        description: 'Gestor de combate para la 5.ª edición (2024).',
        lang: 'es',
        theme_color: '#15100c',
        background_color: '#15100c',
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
