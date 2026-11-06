#!/usr/bin/env node
// Ghép docs/can-ban-cung-cap.d/*.md → docs/CAN_BAN_CUNG_CAP.md (file ghép KHÔNG commit). Dùng: pnpm cbcc:build · hoặc `pnpm docs:build`.
// Mỗi tài nguyên = MỘT file `<mã-gap>.md`, nội dung là cả mục (bắt đầu bằng `## <số>. <tên> — \`MÃ\``).
// Thứ tự trong file ghép = thứ tự tên file: các mục cũ mang tiền tố số `NN-` (giữ đúng thứ tự gốc), mục mới theo `<mã>.md` xếp sau.
import { DOCS_TARGETS } from './lib/docs-targets.mjs';
import { runFragments } from './lib/fragments-cli.mjs';

runFragments(DOCS_TARGETS.find((target) => target.label === 'can-ban-cung-cap'));
