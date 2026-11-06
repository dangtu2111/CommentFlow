// Phần dùng chung của các script ghép tài liệu: đọc thư mục nguồn, kiểm định dạng, ghi file ghép (KHÔNG commit).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { checkFragments } from './docs-check.mjs';
import { assemble } from './fragments.mjs';

/** Đọc mọi file `.md` của thư mục nguồn: tên → nội dung. */
export function readFragments(dir) {
  const files = {};
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.md')) files[name] = readFileSync(new URL(name, dir), 'utf8');
  }
  return files;
}

/** Kiểm các file nhỏ rồi ghi file ghép; thoát 1 nếu có lỗi. `onlyCheck` = chỉ kiểm, không ghi. */
export function runFragments(target, { onlyCheck = false } = {}) {
  const files = readFragments(target.dir);
  const problems = checkFragments(target, files);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  const count = Object.keys(files).length;
  if (onlyCheck) {
    console.log(`${target.label}: đạt (${count} file)`);
    return;
  }
  writeFileSync(target.out, assemble(files, target.sections).text);
  console.log(`${target.label}: đã ghi ${target.outName} từ ${count} file`);
}
