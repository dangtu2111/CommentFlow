import { defineConfig } from 'vitest/config';

// Test đơn vị (không cần database). Test tích hợp: vitest.int.config.ts (`pnpm test:db`).
// Ngưỡng coverage = mức ĐƠN VỊ đo được 06/11/2026 làm tròn xuống (63% dòng, 53% nhánh; trước đó 41%;
// phần còn lại chủ yếu chỉ được test tích hợp phủ, chưa đo). Mục tiêu 85% (docs/testing/STANDARD.md §8);
// phần chênh là nợ `TEST-COVERAGE-GAP` trong gap matrix. Ratchet: chỉ được tăng.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 63, statements: 61, functions: 63, branches: 53 },
    },
  },
});
