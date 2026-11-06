// Kiểm ĐỊNH DẠNG và ĐỘC NHẤT của các file nhỏ (fragment) — thay cho `*:check` cũ (so bản ghép với bản commit).
// Hàm thuần: nhận tên file → nội dung, trả danh sách lỗi.
import { assemble } from './fragments.mjs';

const normalize = (text) => text.replace(/\r\n/g, '\n');

/**
 * @param {{ label: string, sections: object[], rules?: object[], byFileName?: object[] }} target
 * @param {Record<string, string>} files
 * @returns {string[]} lỗi (rỗng = đạt)
 */
export function checkFragments(target, files) {
  const problems = assemble(files, target.sections).problems.map((p) => `${target.label}: ${p}`);
  const codes = new Map(); // mã (chữ hoa) → tên file đầu tiên

  for (const [name, raw] of Object.entries(files)) {
    if (name.startsWith('_')) continue;
    const first = normalize(raw).split('\n', 1)[0];

    for (const rule of target.rules ?? []) {
      if (!name.startsWith(rule.prefix)) continue;
      if (rule.prefix === 'q' && name.startsWith('docs-')) continue; // `q` không nhận nhầm `docs-…`
      if (!rule.start.test(first)) {
        problems.push(`${target.label}: ${name}: dòng đầu phải là ${rule.what}`);
      } else if (rule.code) {
        const code = rule.code.exec(first)?.[1]?.toUpperCase();
        if (code) trackCode(problems, codes, target.label, name, `${rule.prefix}:${code}`, code);
      }
      break;
    }

    for (const rule of target.byFileName ?? []) {
      const m = rule.re.exec(name);
      if (!m) continue;
      const code = m[1].toUpperCase();
      const expected = rule.first(code);
      if (!first.startsWith(expected)) {
        problems.push(`${target.label}: ${name}: dòng đầu phải bắt đầu bằng "${expected}"`);
      }
      trackCode(problems, codes, target.label, name, `${rule.re.source}:${code}`, code);
    }
  }
  return problems;
}

function trackCode(problems, seen, label, name, key, code) {
  if (seen.has(key)) problems.push(`${label}: ${name}: trùng mã ${code} (đã có ở ${seen.get(key)})`);
  else seen.set(key, name);
}
