import { defineConfig } from 'vitest/config';

// Test tích hợp: chạy trên DB test thật (TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL → cf_test).
// Biến lấy từ môi trường hoặc file .env ở gốc repo (Node đọc, không in ra). Thiếu biến → thất bại rõ ràng.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // Không có .env (ví dụ CI): dùng biến môi trường sẵn có.
}

export default defineConfig({
  test: {
    include: ['tests/**/*.int.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    env: { APP_ENV: process.env.APP_ENV ?? 'test' },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
