import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Playwright transpila este archivo a CommonJS (apps/web no declara
// "type": "module"), así que la raíz del monorepo se resuelve desde el cwd
// que npm fija al ejecutar el workspace: apps/web -> ../..
const repoRoot = path.resolve(process.cwd(), '../..');

const apiEnv = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '3000',
  HOST: '127.0.0.1',
  JWT_SECRET: process.env.JWT_SECRET || 'e2e-jwt-secret-with-at-least-32-characters',
  META_WHATSAPP_TOKEN: '',
  META_PHONE_NUMBER_ID: '',
  GEMINI_API_KEY: '',
  QUEUE_WORKER_ENABLED: 'false',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    // Next dev sirve los recursos de desarrollo para `localhost`; usar
    // 127.0.0.1 hace que bloquee /_next/* y la página no hidrate.
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev --workspace=@asistente/api',
      cwd: repoRoot,
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: apiEnv,
    },
    {
      command: 'npm run dev --workspace=@asistente/web',
      cwd: repoRoot,
      url: 'http://localhost:3001/login',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
