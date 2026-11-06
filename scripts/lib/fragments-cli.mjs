// Phần dùng chung của các script ghép tài liệu: đọc thư mục nguồn, ghi hoặc kiểm file ghép.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { assemble, diffAgainst } from './fragments.mjs';

/**
 * @param {{ label: string, command: string, dir: URL, out: URL, outName: string, sections: { head: string, prefix?: string, separator?: string }[] }} target
 * @param {string[]} args  `--check` = chỉ kiểm, thoát 1 nếu lệch
 */
export function runFragments(target, args) {
  const files = {};
  for (const name of readdirSync(target.dir)) {
    if (name.endsWith('.md')) files[name] = readFileSync(new URL(name, target.dir), 'utf8');
  }
  const { text, problems } = assemble(files, target.sections);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`${target.label}: ${problem}`);
    process.exit(1);
  }
  if (args.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(target.out, 'utf8');
    } catch {}
    if (diffAgainst(text, current)) {
      console.error(
        `${target.label}: ${target.outName} không khớp các file nhỏ — chạy \`${target.command}\` rồi commit cả hai`,
      );
      process.exit(1);
    }
    console.log(`${target.label}: đạt (${Object.keys(files).length} file → ${target.outName})`);
    return;
  }
  writeFileSync(target.out, text);
  console.log(`${target.label}: đã ghi ${target.outName} từ ${Object.keys(files).length} file`);
}
