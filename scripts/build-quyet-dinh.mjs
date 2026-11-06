#!/usr/bin/env node
// Ghép docs/plans/quyet-dinh/*.md → docs/plans/QUYET_DINH_CHO_DUYET.md (file ghép KHÔNG commit). Dùng: pnpm quyet:build · hoặc `pnpm docs:build`.
// Mỗi quyết định = MỘT file `q<mã>.md` (một hàng bảng, ví dụ `q-pda1.md`); mỗi thay đổi docs/01–16 = `docs-<ngày>-<mã>.md`.
import { DOCS_TARGETS } from './lib/docs-targets.mjs';
import { runFragments } from './lib/fragments-cli.mjs';

runFragments(DOCS_TARGETS.find((target) => target.label === 'quyet-dinh'));
