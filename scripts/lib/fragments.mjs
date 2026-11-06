// Ghép tài liệu chung từ nhiều file nhỏ để các nhánh song song chỉ THÊM FILE RIÊNG (không sửa chung một dòng).
// Hàm thuần (không đọc đĩa) — phần đọc/ghi nằm ở `fragments-cli.mjs`.
//
// Quy ước thư mục nguồn (phẳng):
//  - `_<tên>.md`  = phần đầu của một mục (tiêu đề, dòng đầu bảng…), giữ nguyên từng ký tự, thứ tự theo khai báo `sections`;
//  - `<tiền-tố><tên>.md` = một hàng/mục của mục đó; mỗi file là MỘT hàng (dòng bắt đầu bằng khoảng trắng nối vào hàng trước);
//  - hàng trong mục sắp theo tên file (so sánh theo mã ký tự, không phụ thuộc locale) → kết quả xác định.

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normalize = (text) => text.replace(/\r\n/g, '\n');

/**
 * @param {Record<string, string>} files  tên file → nội dung
 * @param {{ head: string, prefix?: string, separator?: string }[]} sections  thứ tự mục; `prefix` không khai báo = mục chỉ có phần đầu,
 *   `''` = nhận mọi file không bắt đầu bằng `_`; `separator` = chuỗi nối các file trong mục (mặc định một dòng mới;
 *   `'\n\n'` khi mỗi file là cả một đoạn/mục dài)
 * @returns {{ text: string, problems: string[] }}
 */
export function assemble(files, sections) {
  const problems = [];
  const names = Object.keys(files).sort(byCodeUnit);
  const claimed = new Set();
  const parts = [];

  for (const section of sections) {
    if (!(section.head in files)) {
      problems.push(`thiếu file phần đầu ${section.head}`);
      continue;
    }
    claimed.add(section.head);
    const head = normalize(files[section.head]);
    const rows = [];
    if (section.prefix !== undefined) {
      for (const name of names) {
        if (name.startsWith('_') || !name.startsWith(section.prefix)) continue;
        claimed.add(name);
        const row = normalize(files[name]).trimEnd();
        if (row === '') problems.push(`${name}: file rỗng`);
        else rows.push(row);
      }
    }
    parts.push(rows.length > 0 ? head + rows.join(section.separator ?? '\n') : head.trimEnd());
  }

  for (const name of names) {
    if (!claimed.has(name)) {
      problems.push(`${name}: không thuộc mục nào (tiền tố lạ hoặc phần đầu không khai báo)`);
    }
  }
  const text = `${parts.map((part) => part.trimEnd()).join('\n\n')}\n`;
  return { text, problems };
}

/** Chia nội dung một mục thành các hàng (dùng khi tách lần đầu và trong test). */
export function splitRows(block) {
  const rows = [];
  for (const line of normalize(block).split('\n')) {
    if (line.trim() === '') continue;
    if (/^\s/.test(line) && rows.length > 0) rows[rows.length - 1] += `\n${line}`;
    else rows.push(line);
  }
  return rows;
}
