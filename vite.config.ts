/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH permite publicar en una subruta (p. ej. GitHub Pages: /cronica-combate/).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  // versión y fecha de la compilación (en Ajustes > Acerca de)
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version || ''), __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
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
        // og.png: solo la usan las vistas previas al compartir el enlace
        globIgnores: ['**/firebase-*.js', 'og.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Crónica de Combate',
        short_name: 'Crónica',
        description: 'Gestor de combate para la 5.ª edición (2024).',
        lang: 'es',
        theme_color: '#26211d',
        background_color: '#26211d',
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
