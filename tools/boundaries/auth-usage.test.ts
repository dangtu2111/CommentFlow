import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Pool role `cf_auth` (`createAuthDb`) mở TOÀN BỘ bảng xác thực (băm mật khẩu, token phiên thô, mã xác minh).
 * Luật dependency-cruiser `chi-auth-import-auth-db` bắt import; test này bắt thêm các cách vòng qua import
 * (gọi theo tên, require động) bằng cách quét nội dung file, và bảo đảm API cũ (`db.auth`, `withAuthContext`
 * trên pool cf_app) không quay lại.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCAN_DIRS = ['apps', 'packages', 'scripts', 'tools'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'migrations', 'fixtures']);
const POOL_USAGE = /\bcreateAuthDb\b|@flow\/db\/auth-db|\bAuthDb\b|\bunwrapAuthDb\b|\bwrapAuthDb\b/;
const REMOVED_API = /\bwithAuthContext\b|\bdb\.auth\b/;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) yield full;
  }
}

const rel = (file: string) => relative(ROOT, file).split(sep).join('/');
const isAllowed = (path: string) =>
  path.startsWith('packages/db/') ||
  path.startsWith('packages/saas-core/src/auth/') ||
  path.startsWith('tools/boundaries/') ||
  /(^|\/)tests\//.test(path) ||
  /\.test\.(ts|tsx|mjs)$/.test(path);

describe('pool role cf_auth chỉ dùng trong mã xác thực', () => {
  const files = SCAN_DIRS.flatMap((d) => [...sourceFiles(join(ROOT, d))]).map((f) => ({
    path: rel(f),
    text: readFileSync(f, 'utf8'),
  }));

  it('quét được mã nguồn thật và thấy chỗ dùng hợp lệ (phép thử không rỗng)', () => {
    const users = files.filter((f) => POOL_USAGE.test(f.text)).map((f) => f.path);
    expect(users).toContain('packages/saas-core/src/auth/auth.ts');
    expect(users).toContain('packages/saas-core/src/auth/revoke.ts');
    expect(users).toContain('packages/db/src/auth-db.ts');
  });

  it('không có chỗ dùng nào ngoài saas-core/src/auth, packages/db và test', () => {
    const offenders = files
      .filter((f) => POOL_USAGE.test(f.text) && !isAllowed(f.path))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('API cũ (db.auth, withAuthContext trên pool cf_app) không còn ở đâu (trừ test này)', () => {
    const offenders = files
      .filter((f) => REMOVED_API.test(f.text) && f.path !== 'tools/boundaries/auth-usage.test.ts')
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
