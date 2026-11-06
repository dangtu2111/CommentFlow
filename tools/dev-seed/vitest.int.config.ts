import { defineConfig } from 'vitest/config';
import { loadRepoEnv } from '../../scripts/lib/load-env.mjs';

// Test tích hợp: chạy seed trên DB test thật (TEST_DATABASE_* → cf_test / cf_test_<làn>), KHÔNG bao giờ cf_dev.
loadRepoEnv(new URL('../../', import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['src/int-global-setup.ts'],
    env: { APP_ENV: process.env.APP_ENV ?? 'test' },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
