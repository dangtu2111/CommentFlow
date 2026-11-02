import { defineConfig } from 'vitest/config';

// Test đơn vị (không cần database). Test tích hợp: vitest.int.config.ts (`pnpm test:db`).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
