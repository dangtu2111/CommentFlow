#!/usr/bin/env node
// Từ MÁY CODE, kiểm các dịch vụ cf-dev (7 cổng) qua LAN (không cần mật khẩu).
//   pnpm stack:check
//   node --env-file=.env scripts/stack-check.mjs   (kiểm thêm AUTH Valkey nếu .env có REDIS_URL)
import {
  checkHttp,
  checkPostgres,
  checkSmtp,
  checkValkey,
  passwordFromRedisUrl,
} from './lib/stack-check.mjs';

const host = process.env.CF_DEV_HOST ?? '192.168.1.124';
const valkeyPassword = process.env.REDIS_URL
  ? passwordFromRedisUrl(process.env.REDIS_URL)
  : undefined;

const checks = [
  ['Postgres  :5433', () => checkPostgres(host, 5433)],
  ['Valkey    :6380', () => checkValkey(host, 6380, valkeyPassword)],
  [
    'ml        :8001',
    () => checkHttp(`http://${host}:8001/health`, { expectBody: '"service":"ml"' }),
  ],
  ['LiteLLM   :4000', () => checkHttp(`http://${host}:4000/health/liveliness`)],
  ['LiteLLM   :4000 (readiness)', () => checkHttp(`http://${host}:4000/health/readiness`)],
  ['Langfuse  :3100 (health)', () => checkHttp(`http://${host}:3100/api/public/health`)],
  ['Mailpit   :1025 (SMTP)', () => checkSmtp(host, 1025)],
  ['Mailpit   :8025 (giao diện)', () => checkHttp(`http://${host}:8025/readyz`)],
  ['Langfuse  :3100 (giao diện)', () => checkHttp(`http://${host}:3100/auth/sign-in`)],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    const { ok, detail } = await run();
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'LỖI'}  ${name.padEnd(30)} ${detail}`);
  } catch (error) {
    failed++;
    console.log(`LỖI  ${name.padEnd(30)} ${error instanceof Error ? error.message : error}`);
  }
}
console.log(
  failed === 0
    ? `\nTất cả ${checks.length} kiểm tra đạt.`
    : `\n${failed}/${checks.length} kiểm tra lỗi.`,
);
process.exit(failed === 0 ? 0 : 1);
