// Mutation testing (Stryker, Apache-2.0) — docs/testing/STANDARD.md §8: ≥ 80% mutant bị diệt cho module logic quy tắc.
// Chạy TRƯỚC KHI MERGE nhánh chạm các module này (`pnpm --filter @flow/ai test:mutation`), không chạy mọi commit (chậm).
// Phạm vi hẹp để chạy nhanh; thêm file khi module mới thuộc §4 STANDARD ra đời.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // pnpm cô lập node_modules → phải chỉ rõ plugin (Stryker không tự quét được).
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.config.ts' },
  mutate: ['src/recheck/send-recheck.ts', 'src/gate/auto-send-gate.ts', 'src/guard-money.ts'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress'],
  thresholds: { high: 90, low: 80, break: 80 },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
