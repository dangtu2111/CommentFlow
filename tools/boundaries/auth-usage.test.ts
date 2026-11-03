import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `db.auth` và `withAuthContext` mở TOÀN BỘ bảng xác thực (băm mật khẩu, token phiên thô, mã xác minh).
 * Chỉ mã xác thực của saas-core (và chính @flow/db) được dùng; nơi khác dùng là rò dữ liệu.
 * dependency-cruiser chỉ chặn được import nên luật này kiểm theo nội dung file.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCAN_DIRS = ['apps', 'packages', 'scripts', 'tools'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'migrations', 'fixtures']);
const USAGE =
  /\bwithAuthContext\b|\bdb\.auth\b|\.auth\s*\.\s*(select|insert|update|delete|execute|transaction)\b/;

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

describe('db.auth / withAuthContext chỉ dùng trong mã xác thực', () => {
  const files = SCAN_DIRS.flatMap((d) => [...sourceFiles(join(ROOT, d))]).map((f) => ({
    path: rel(f),
    text: readFileSync(f, 'utf8'),
  }));

  it('quét được mã nguồn thật và thấy chỗ dùng hợp lệ (phép thử không rỗng)', () => {
    const users = files.filter((f) => USAGE.test(f.text)).map((f) => f.path);
    expect(users).toContain('packages/saas-core/src/auth/auth.ts');
    expect(users).toContain('packages/saas-core/src/auth/revoke.ts');
    expect(users).toContain('packages/db/src/client.ts');
  });

  it('không có chỗ dùng nào ngoài saas-core/src/auth, packages/db và test', () => {
    const offenders = files
      .filter((f) => USAGE.test(f.text) && !isAllowed(f.path))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
