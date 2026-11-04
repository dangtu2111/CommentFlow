import { defineConfig } from 'vitest/config';

// Test đơn vị (không cần database). Test tích hợp: vitest.int.config.ts (`pnpm test:db`).
// Ngưỡng coverage = mức ĐƠN VỊ đo được 04/11/2026 làm tròn xuống (41% dòng/nhánh: phần lớn
// mã chỉ được test tích hợp phủ, chưa đo). Mục tiêu 85% (docs/testing/STANDARD.md §8);
// phần chênh là nợ `TEST-COVERAGE-GAP` trong gap matrix. Ratchet: chỉ được tăng.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 41, statements: 40, functions: 39, branches: 41 },
    },
  },
});
