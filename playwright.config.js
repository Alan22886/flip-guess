import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:4173', acceptDownloads: true },
  projects: [
    { name: 'chromium', use: { ...devices['iPhone 15 Pro'], defaultBrowserType: 'chromium' } },
    { name: 'webkit', use: { ...devices['iPhone 15 Pro'], defaultBrowserType: 'webkit' } },
  ],
  webServer: {
    command: 'node scripts/build.mjs && node tests/server.mjs',
    url: 'http://127.0.0.1:4173/flip-guess/',
  },
});
