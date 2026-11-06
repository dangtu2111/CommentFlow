#!/usr/bin/env node
// Ghép docs/codemap.d/*.md → docs/codemap.md (file ghép KHÔNG commit). Dùng: pnpm codemap:build · hoặc `pnpm docs:build` (cả bốn bộ).
// Thêm/đổi vai trò file → thêm/sửa FILE RIÊNG trong docs/codemap.d/ (tiền tố lenh-/cay-/mien-/diem-vao-/bay-). Khai báo: scripts/lib/docs-targets.mjs.
import { DOCS_TARGETS } from './lib/docs-targets.mjs';
import { runFragments } from './lib/fragments-cli.mjs';

runFragments(DOCS_TARGETS.find((target) => target.label === 'codemap'));
