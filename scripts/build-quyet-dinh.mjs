#!/usr/bin/env node
// Ghép docs/plans/quyet-dinh/*.md → docs/plans/QUYET_DINH_CHO_DUYET.md (xác định). Dùng: pnpm quyet:build · pnpm quyet:check
// Mỗi quyết định = MỘT file `q<mã>.md` (một hàng bảng, ví dụ `q-pda1.md`); mỗi thay đổi docs/01–16 = `docs-<ngày>-<mã>.md`.
import { runFragments } from './lib/fragments-cli.mjs';

runFragments(
  {
    label: 'quyet-dinh',
    command: 'pnpm quyet:build',
    dir: new URL('../docs/plans/quyet-dinh/', import.meta.url),
    out: new URL('../docs/plans/QUYET_DINH_CHO_DUYET.md', import.meta.url),
    outName: 'docs/plans/QUYET_DINH_CHO_DUYET.md',
    sections: [
      { head: '_bang.md', prefix: 'q' },
      { head: '_docs.md', prefix: 'docs-' },
    ],
  },
  process.argv.slice(2),
);
