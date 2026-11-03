import { defineConfig } from 'vitest/config';

// Chỉ test đơn vị của support/ — kịch bản Playwright (tests/*.spec.ts) chạy bằng `pnpm e2e`.
export default defineConfig({ test: { include: ['support/**/*.test.ts'] } });
