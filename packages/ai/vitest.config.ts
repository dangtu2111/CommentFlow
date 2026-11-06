import { defineConfig } from 'vitest/config';

// Test đơn vị (không cần database). Test tích hợp: vitest.int.config.ts (`pnpm test:db`).
// Ngưỡng coverage = mức đo được 04/11/2026 làm tròn xuống (ratchet: chỉ được tăng).
// Mục tiêu 85% dòng + nhánh (docs/testing/STANDARD.md §8); xem gap matrix `TEST-COVERAGE-GAP`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary'],
      thresholds: {
        lines: 100,
        statements: 97,
        functions: 100,
        branches: 90,
        // Module logic quy tắc (STANDARD §8): ≥95% nhánh theo file.
        'src/guard-money.ts': { branches: 95 },
        'src/confidence/*.ts': { branches: 95 },
        'src/route/*.ts': { branches: 95 },
        'src/retrieve/*.ts': { branches: 95 },
        'src/decide/*.ts': { branches: 95 },
        'src/gate/*.ts': { branches: 95 },
        'src/injection/*.ts': { branches: 95 },
      },
    },
  },
});
