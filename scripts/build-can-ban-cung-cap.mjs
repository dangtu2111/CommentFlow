#!/usr/bin/env node
// Ghép docs/can-ban-cung-cap.d/*.md → docs/CAN_BAN_CUNG_CAP.md (xác định). Dùng: pnpm cbcc:build · pnpm cbcc:check
// Tài nguyên ngoài mới = thêm MỘT FILE RIÊNG `docs/can-ban-cung-cap.d/<mã-gap>.md` (chữ thường, ví dụ `fb-oauth.md`),
// nội dung là cả mục (bắt đầu bằng `## <số>. <tên> — \`MÃ\``). Không sửa tay docs/CAN_BAN_CUNG_CAP.md.
// Thứ tự trong file ghép = thứ tự tên file: các mục cũ mang tiền tố số `NN-` (giữ đúng thứ tự gốc), mục mới theo `<mã>.md` xếp sau.
import { runFragments } from './lib/fragments-cli.mjs';

runFragments(
  {
    label: 'can-ban-cung-cap',
    command: 'pnpm cbcc:build',
    dir: new URL('../docs/can-ban-cung-cap.d/', import.meta.url),
    out: new URL('../docs/CAN_BAN_CUNG_CAP.md', import.meta.url),
    outName: 'docs/CAN_BAN_CUNG_CAP.md',
    sections: [{ head: '_00-dau.md', prefix: '', separator: '\n\n' }],
  },
  process.argv.slice(2),
);
