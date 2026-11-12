/**
 * Dựng biến môi trường cho `pnpm e2e` (scripts/e2e.mjs): web chạy với DB TEST (`cf_test`, hoặc `cf_test_<làn>` khi có
 * `CF_LANE`), không bao giờ `cf_dev`. Hàm thuần — không đọc file, không in giá trị biến (chỉ nêu TÊN biến thiếu).
 */

import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Biến phải có (sau khi nạp `.env.local` + `.env`) để chạy E2E. */
export const REQUIRED_VARS = [
  'TEST_DATABASE_URL',
  'TEST_DATABASE_ADMIN_URL',
  'TEST_DATABASE_AUTH_URL',
  'REDIS_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'MAILPIT_URL',
  'BETTER_AUTH_SECRET',
];

const TEST_DB_PATTERN = /^cf_test(_[a-z0-9]+)*$/;
const LANE_PATTERN = /^[a-z0-9]{1,16}$/;

/** Tên database ở phần đường dẫn của URL Postgres (không bao giờ ném lỗi chứa URL/mật khẩu). */
export function databaseNameOf(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Một chuỗi kết nối database không đúng định dạng URL.');
  }
}

/**
 * Chuỗi kết nối tới DB test của làn: `cf_test` → `cf_test_<lane>` khi có lane. Từ chối DB không phải `cf_test*`.
 * DB `cf_test_<lane>` phải có sẵn (script không tạo database).
 */
export function testDatabaseUrl(url, lane) {
  const name = databaseNameOf(url);
  if (!TEST_DB_PATTERN.test(name)) {
    throw new Error(`E2E chỉ chạy trên DB test (cf_test*), nhưng chuỗi kết nối trỏ tới "${name}".`);
  }
  if (!lane) return url;
  if (!LANE_PATTERN.test(lane)) {
    throw new Error('CF_LANE chỉ gồm chữ thường/số, tối đa 16 ký tự (ví dụ "b").');
  }
  const parsed = new URL(url);
  parsed.pathname = `/${name === 'cf_test' ? `cf_test_${lane}` : name}`;
  return parsed.toString();
}

/**
 * @param {Record<string, string | undefined>} source biến hiện có (`process.env` sau `loadRepoEnv`)
 * @param {{ port: number, lane?: string }} options
 * @returns {Record<string, string>} biến cho web, migration và Playwright (đã gộp, ưu tiên giá trị E2E)
 */
export function buildE2eEnv(source, { port, lane }) {
  const missing = REQUIRED_VARS.filter((name) => !source[name]);
  if (missing.length > 0) {
    throw new Error(
      `Thiếu biến môi trường cho E2E: ${missing.join(', ')}. Tạo .env bằng print-dev-env.sh và .env.local (BETTER_AUTH_SECRET).`,
    );
  }
  const laneName = lane || source.CF_LANE || '';
  const at = (name) => testDatabaseUrl(/** @type {string} */ (source[name]), laneName);
  const baseUrl = `http://localhost:${port}`;
  return {
    ...Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)),
    APP_ENV: 'test',
    DATABASE_URL: at('TEST_DATABASE_URL'),
    DATABASE_ADMIN_URL: at('TEST_DATABASE_ADMIN_URL'),
    DATABASE_AUTH_URL: at('TEST_DATABASE_AUTH_URL'),
    // Role worker (kb:switch-embedding, worker E2E): chỉ khi có biến; DB test của làn như ba URL trên.
    ...(source.TEST_DATABASE_WORKER_URL
      ? { DATABASE_WORKER_URL: at('TEST_DATABASE_WORKER_URL') }
      : {}),
    // Tiền tố riêng: rate limit của E2E không dùng chung khóa với web dev (`dev:`).
    REDIS_KEY_PREFIX: source.E2E_REDIS_KEY_PREFIX || 'e2e:',
    // Người gửi thư thử (Mailpit): không phải bí mật; mặc định khi .env chưa có.
    SMTP_FROM: source.SMTP_FROM || 'CommentFlow AI <no-reply@commentflow.local>',
    // Dev/test không ra internet; vẫn còn danh sách mật khẩu phổ biến cục bộ.
    PWNED_CHECK: 'off',
    CLIENT_IP_SOURCE: 'none',
    // Hồ sơ (SETTINGS-PROFILE-WIRE): chỉ bật ở E2E (APP_ENV=test) — SMS MOCK ghi mã OTP vào tệp tạm để E2E đọc, ảnh đại diện MOCK.
    PHONE_VERIFY_ENABLED: 'true',
    NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED: 'true',
    SMS_MOCK_OUTBOX_FILE: join(tmpdir(), `cf-e2e-sms-outbox-${port}.jsonl`),
    // Cờ tích hợp THẬT của máy dev (`.env`/`.env.local`) không được lọt vào E2E: bật Shopify làm web đổi token với Shopify thật khi lưu kết nối
    // (tên miền E2E không tồn tại → "chưa kiểm tra được"), bật Facebook OAuth làm web đòi mọi khóa mã hóa token ở khởi động. CI không đặt các cờ này (mặc định tắt).
    SHOPIFY_ENABLED: 'false',
    FB_OAUTH_ENABLED: 'false',
    // Kết nối Shopify mã hóa Client secret bằng TOKEN_ENC_KEYS: E2E tự sinh khóa dùng một lần (không commit) khi môi trường chưa có.
    TOKEN_ENC_KEYS: source.TOKEN_ENC_KEYS || `v1:${randomBytes(32).toString('hex')}`,
    BETTER_AUTH_URL: baseUrl,
    E2E_BASE_URL: baseUrl,
    PORT: String(port),
  };
}

/**
 * Môi trường của bản web THỨ HAI "chưa cấu hình AI" (cùng DB/bản build, khác cổng, KHÔNG có dịch vụ LLM). LITELLM_* đặt thành chuỗi RỖNG chứ không xóa:
 * `next.config.ts` gọi `loadRepoEnv` và `process.loadEnvFile` chỉ không ghi đè biến ĐÃ CÓ — biến vắng mặt sẽ được nạp lại từ `.env` ở gốc repo của máy dev
 * (CI không có `.env` nên không lộ lỗi này). Mã đọc cấu hình coi chuỗi rỗng là chưa đặt.
 * @param {Record<string, string>} env kết quả `buildE2eEnv` (đã gồm LITELLM_* của dịch vụ giả)
 * @param {{ port: number }} options
 * @returns {Record<string, string>}
 */
export function buildNoAiEnv(env, { port }) {
  const base = `http://localhost:${port}`;
  return {
    ...env,
    PORT: String(port),
    BETTER_AUTH_URL: base,
    E2E_BASE_URL: base,
    LITELLM_BASE_URL: '',
    LITELLM_API_KEY: '',
  };
}
