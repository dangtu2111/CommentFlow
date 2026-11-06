// Chạy web dev ở cổng riêng (mặc định 3100) với biến môi trường GIẢ — chỉ để chụp/so giao diện, không DB/Valkey thật.
// Dùng: node e2e/support/dev-ui.mjs [cổng]
import { spawn } from 'node:child_process';

const port = process.argv[2] ?? '3100';
const env = {
  ...process.env,
  APP_ENV: 'dev',
  BETTER_AUTH_SECRET: 'dummy-dummy-dummy-dummy-dummy-dummy-00',
  BETTER_AUTH_URL: `http://localhost:${port}`,
  DATABASE_AUTH_URL: 'postgresql://x:x@127.0.0.1:1/x',
  DATABASE_URL: 'postgresql://x:x@127.0.0.1:1/x',
  REDIS_URL: 'redis://127.0.0.1:1/0',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'CommentFlow AI <no-reply@commentflow.local>',
};
spawn('pnpm', ['--filter', '@flow/web', 'exec', 'next', 'dev', '-p', port], {
  stdio: 'inherit',
  env,
  shell: true,
});
