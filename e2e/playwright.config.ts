import { defineConfig } from '@playwright/test';

/**
 * Cấu hình E2E cổng 0. Web do `scripts/e2e.mjs` khởi động (DB test) và đặt `E2E_BASE_URL`; chạy tay thì tự đặt
 * `E2E_BASE_URL` + `MAILPIT_URL`. Một luồng (các ca của một ngôn ngữ dùng chung một Owner), không thử lại tự động.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
