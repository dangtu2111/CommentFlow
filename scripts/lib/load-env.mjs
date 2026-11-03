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
}
