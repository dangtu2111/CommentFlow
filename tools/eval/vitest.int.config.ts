import { defineConfig } from 'vitest/config';
import { loadRepoEnv } from '../../scripts/lib/load-env.mjs';

// Test cần DB test thật (chỉ gọi hàm pg_trgm): TEST_DATABASE_ADMIN_URL từ môi trường / `.env.local` / `.env` ở gốc repo.
loadRepoEnv(new URL('../../', import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.int.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
