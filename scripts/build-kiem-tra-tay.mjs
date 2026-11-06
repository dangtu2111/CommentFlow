#!/usr/bin/env node
// Ghép docs/testing/kiem-tra-tay.d/*.md → docs/testing/KIEM_TRA_TAY.md (xác định). Dùng: pnpm kt:build · pnpm kt:check
// Một tính năng = HAI file riêng, mã KT duy nhất (chữ thường):
//   `kt-<mã>.md` = cả mục `## KT-<MÃ> — …` (bước kiểm + kết quả mong đợi);
//   `tt-<mã>.md` = MỘT hàng của bảng "Trạng thái" (`| KT-<MÃ> | … |`).
// Không sửa tay docs/testing/KIEM_TRA_TAY.md. Mã KT trùng → `pnpm kt:check` báo lỗi.
import { readdirSync, readFileSync } from 'node:fs';
import { runFragments } from './lib/fragments-cli.mjs';

const dir = new URL('../docs/testing/kiem-tra-tay.d/', import.meta.url);

/** Mã KT phải khớp tên file và không trùng giữa các file. */
function checkCodes() {
  const problems = [];
  const seen = new Map();
  for (const name of readdirSync(dir)) {
    const m = /^(kt|tt)-(.+)\.md$/.exec(name);
    if (!m) continue;
    const first = readFileSync(new URL(name, dir), 'utf8').split('\n', 1)[0];
    const code = `KT-${m[2].toUpperCase()}`;
    const pattern = m[1] === 'kt' ? `## ${code} — ` : `| ${code} |`;
    if (!first.startsWith(pattern))
      problems.push(`${name}: dòng đầu phải bắt đầu bằng "${pattern}"`);
    const key = `${m[1]}:${code}`;
    if (seen.has(key)) problems.push(`${name}: trùng mã ${code}`);
    seen.set(key, name);
  }
  return problems;
}

const problems = checkCodes();
if (problems.length > 0) {
  for (const p of problems) console.error(`kiem-tra-tay: ${p}`);
  process.exit(1);
}

runFragments(
  {
    label: 'kiem-tra-tay',
    command: 'pnpm kt:build',
    dir,
    out: new URL('../docs/testing/KIEM_TRA_TAY.md', import.meta.url),
    outName: 'docs/testing/KIEM_TRA_TAY.md',
    sections: [
      { head: '_trang-thai.md', prefix: 'tt-' },
      { head: '_muc.md', prefix: 'kt-', separator: '\n\n' },
      { head: '_mau.md' },
    ],
  },
  process.argv.slice(2),
);
