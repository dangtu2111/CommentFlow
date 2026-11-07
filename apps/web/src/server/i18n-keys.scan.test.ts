import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vi from '../../../../packages/shared/src/i18n/messages/vi.json';

/**
 * Test QUÉT hồi quy: tiêu đề trang từng gọi khóa dịch `shell.brand` đã bị xóa khỏi `vi.json`/`en.json`
 * (tên sản phẩm nay đọc từ `getBrand().name`, FR-125) → trang /app/settings và 15 trang khác lỗi MISSING_MESSAGE.
 */
const SRC = join(__dirname, '..');
const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });

describe('khóa tên thương hiệu', () => {
  it('vi.json không còn shell.brand (nguồn duy nhất là getBrand)', () => {
    expect((vi as { shell: Record<string, unknown> }).shell.brand).toBeUndefined();
  });

  it("không file nào trong apps/web/src gọi ('brand') của namespace shell", () => {
    const bad = listFiles(SRC)
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('i18n-keys.scan.test.ts'))
      .filter((f) => /\btb\(\s*['"]brand['"]\s*\)/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
