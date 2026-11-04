#!/usr/bin/env node
// Cổng truy vết FR → test (không dùng AI). Dùng: pnpm test:trace
//  - mã FR của các dòng gap matrix trạng thái ✅ phải có trong TÊN ít nhất một test (describe/it/test);
//  - "nợ truy vết" của các dòng đã Xong từ trước nằm ở docs/testing/trace-baseline.json;
//  - ĐỎ chỉ với mã FR thiếu test mà KHÔNG nằm trong baseline; luôn in số nợ còn lại.
// Baseline chỉ được GIẢM (xóa mã khi đã có test). Quy tắc: docs/testing/STANDARD.md §2.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTrace, frCodesInTestTitles, parseDoneFrCodes } from './lib/test-trace.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.git',
  'test-results',
  '.venv',
]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
// Test của chính bộ dò chứa mã FR giả làm dữ liệu mẫu — không tính là truy vết thật.
const SELF_TEST = join(root, 'scripts', 'lib', 'test-trace.test.mjs');

function* testFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* testFiles(path);
    else if (TEST_FILE.test(name) && path !== SELF_TEST) yield path;
  }
}

const gapMatrix = readFileSync(join(root, 'docs/gap-matrix.md'), 'utf8');
const baselineFile = JSON.parse(
  readFileSync(join(root, 'docs/testing/trace-baseline.json'), 'utf8'),
);

const tested = new Set();
let fileCount = 0;
for (const file of testFiles(root)) {
  fileCount += 1;
  for (const code of frCodesInTestTitles(readFileSync(file, 'utf8'))) tested.add(code);
}

const result = compareTrace({
  rows: parseDoneFrCodes(gapMatrix),
  tested,
  baseline: baselineFile.codes,
});

for (const code of result.removableFromBaseline) {
  console.log(
    `test:trace: ${code} đã có test — xóa khỏi docs/testing/trace-baseline.json (nợ chỉ giảm)`,
  );
}
for (const code of result.staleBaseline) {
  console.log(
    `test:trace: ${code} trong baseline nhưng không dòng Xong nào đòi — xóa khỏi baseline`,
  );
}
if (!result.ok) {
  for (const { code, rows } of result.newMissing) {
    console.error(
      `test:trace: ${code} (dòng gap matrix: ${rows.join(', ')}) đã Xong nhưng KHÔNG có test mang mã này`,
    );
  }
  console.error(
    `\ntest:trace: ${result.newMissing.length} mã FR mới thiếu truy vết. Thêm test có mã FR trong tên (describe('FR-xxx …')); ` +
      'không thêm vào baseline để qua cổng.',
  );
  process.exit(1);
}
console.log(
  `test:trace: đạt (${fileCount} file test quét; nợ truy vết còn lại ${result.remainingDebt.length}/${baselineFile.codes.length} mã trong baseline)`,
);
