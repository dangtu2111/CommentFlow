import { defineConfig } from 'vitest/config';

// Ngưỡng coverage = mức đo được 04/11/2026 làm tròn xuống (ratchet: chỉ được tăng).
// Mục tiêu 85% dòng + nhánh, 95% nhánh cho module logic quy tắc (docs/testing/STANDARD.md §8).
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 93 },
    },
  },
});
