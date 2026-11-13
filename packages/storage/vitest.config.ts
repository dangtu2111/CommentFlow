import { defineConfig } from 'vitest/config';

// Test đơn vị (không cần database). Module logic quy tắc (cửa sổ, giới hạn, hành động được phép): ngưỡng nhánh ≥ 95%
// theo docs/testing/STANDARD.md; ngưỡng thực thi đặt sau khi đo (ratchet: chỉ được tăng).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'src/index.ts', 'src/testing/index.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 98, statements: 99, functions: 100, branches: 98 },
    },
  },
});
