import { existsSync } from 'node:fs';

/**
 * Nạp biến môi trường ở gốc repo cho web, worker, script và test.
 * Thứ tự ưu tiên (cao → thấp): biến của hệ điều hành/CI > `.env.local` > `.env`.
 * `.env` do `print-dev-env.sh` sinh lại được (ghi đè cả file); khóa riêng của máy code (ví dụ BETTER_AUTH_SECRET)
 * nằm ở `.env.local` nên chạy lại script không làm mất. `process.loadEnvFile` KHÔNG ghi đè biến đã có,
 * vì vậy nạp `.env.local` TRƯỚC rồi mới tới `.env`.
 * @param {URL | string} rootDir thư mục gốc repo (URL kết thúc bằng '/' hoặc đường dẫn thư mục)
 */
export function loadRepoEnv(rootDir) {
  const base =
    typeof rootDir === 'string' ? new URL(`file://${rootDir.replace(/\\/g, '/')}/`) : rootDir;
  for (const name of ['.env.local', '.env']) {
    const file = new URL(name, base);
    if (existsSync(file)) process.loadEnvFile(file);
  }
  applyLane(process.env);
}

/** Làn: chữ thường/số, 1–8 ký tự (khớp migration-guard và script máy ảo). */
const LANE_PATTERN = /^[a-z0-9]{1,8}$/;
const TEST_URL_KEYS = ['TEST_DATABASE_URL', 'TEST_DATABASE_ADMIN_URL', 'TEST_DATABASE_AUTH_URL'];

/**
 * `CF_LANE=<làn>` → ba URL DB test trỏ tới `cf_test_<làn>` (mỗi làn một DB, chạy song song không giẫm chân nhau).
 * Không đặt/rỗng → giữ nguyên. Chỉ đổi URL có tên DB đúng `cf_test`; không đụng `DATABASE_URL` (dev).
 * @param {Record<string, string | undefined>} env
 */
export function applyLane(env) {
  const lane = env.CF_LANE;
  if (lane === undefined || lane === '') return;
  if (!LANE_PATTERN.test(lane)) {
    throw new Error('CF_LANE không hợp lệ: chỉ chữ thường/số, tối đa 8 ký tự (ví dụ a, b, c).');
  }
  for (const key of TEST_URL_KEYS) {
    const value = env[key];
    if (value) env[key] = value.replace(/\/cf_test(?=$|[?#])/, `/cf_test_${lane}`);
  }
}
