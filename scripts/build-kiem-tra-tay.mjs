#!/usr/bin/env node
// Ghép docs/testing/kiem-tra-tay.d/*.md → docs/testing/KIEM_TRA_TAY.md (file ghép KHÔNG commit). Dùng: pnpm kt:build · hoặc `pnpm docs:build`.
// Một tính năng = HAI file riêng, mã KT duy nhất (chữ thường):
//   `kt-<mã>.md` = cả mục `## KT-<MÃ> — …` (bước kiểm + kết quả mong đợi);
//   `tt-<mã>.md` = MỘT hàng của bảng "Trạng thái" (`| KT-<MÃ> | … |`).
import { DOCS_TARGETS } from './lib/docs-targets.mjs';
import { runFragments } from './lib/fragments-cli.mjs';

runFragments(DOCS_TARGETS.find((target) => target.label === 'kiem-tra-tay'));
