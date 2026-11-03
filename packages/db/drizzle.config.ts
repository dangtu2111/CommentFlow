import { defineConfig } from 'drizzle-kit';

// Chỉ dùng để SINH migration (không cần kết nối DB). Áp migration: `pnpm db:migrate` (có chặn môi trường).
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema/core/index.ts', './src/schema/cf/index.ts'],
  out: './migrations',
  schemaFilter: ['core', 'cf'],
});
