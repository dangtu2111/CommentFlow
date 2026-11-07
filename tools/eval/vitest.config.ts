import { defineConfig } from 'vitest/config';

// Test đơn vị (không mạng, không DB, không LLM thật).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], exclude: ['node_modules/**'] },
});
