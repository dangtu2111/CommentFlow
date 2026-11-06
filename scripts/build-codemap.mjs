#!/usr/bin/env node
// Ghép docs/codemap.d/*.md → docs/codemap.md (xác định). Dùng: pnpm codemap:build · pnpm codemap:check
// Thêm/đổi vai trò file → thêm/sửa FILE RIÊNG trong docs/codemap.d/ (tiền tố lenh-/cay-/mien-/diem-vao-/bay-), không sửa codemap.md bằng tay.
import { runFragments } from './lib/fragments-cli.mjs';

runFragments(
  {
    label: 'codemap',
    command: 'pnpm codemap:build',
    dir: new URL('../docs/codemap.d/', import.meta.url),
    out: new URL('../docs/codemap.md', import.meta.url),
    outName: 'docs/codemap.md',
    sections: [
      { head: '_00-dau.md' },
      { head: '_lenh.md', prefix: 'lenh-' },
      { head: '_cay.md', prefix: 'cay-' },
      { head: '_mien.md', prefix: 'mien-' },
      { head: '_diem-vao.md', prefix: 'diem-vao-' },
      { head: '_bay.md', prefix: 'bay-' },
    ],
  },
  process.argv.slice(2),
);
