import { defineConfig, devices } from '@playwright/test';

// Pruebas en un navegador real contra la build de producción (con su service worker).
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', locale: 'es-ES', trace: 'retain-on-failure' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'tablet', use: { ...devices['Galaxy Tab S9 landscape'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
