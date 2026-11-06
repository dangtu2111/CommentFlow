#!/usr/bin/env node
// `pnpm docs:build`: ghép cả bốn bộ tài liệu (codemap, QUYET_DINH, CAN_BAN_CUNG_CAP, KIEM_TRA_TAY) từ file nhỏ.
// `pnpm docs:check` (= `--check`): chỉ kiểm định dạng + độc nhất mã của file nhỏ, không ghi.
// Chạy `pnpm docs:build` ĐẦU PHIÊN để có docs/codemap.md…; các file ghép đã .gitignore, không commit.
import { DOCS_TARGETS } from './lib/docs-targets.mjs';
import { runFragments } from './lib/fragments-cli.mjs';

const onlyCheck = process.argv.includes('--check');
for (const target of DOCS_TARGETS) runFragments(target, { onlyCheck });
