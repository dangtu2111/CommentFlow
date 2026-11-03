// Kiểm tra thư mục migration (không dùng AI): số thứ tự liên tục và không trùng, journal khớp file .sql.
// Hai nhánh cùng thêm migration sẽ trùng số → phát hiện ở CI trước khi merge (docs/workflows/parallel.md).

const NAME = /^(\d{4})_[A-Za-z0-9_]+$/;

/**
 * @param {{ journal: { entries: { idx: number, tag: string }[] }, sqlFiles: string[] }} input
 *   sqlFiles: tên file `.sql` trong thư mục migrations (ví dụ `0001_rls.sql`)
 * @returns {string[]} danh sách vấn đề; rỗng = đạt
 */
export function checkMigrations({ journal, sqlFiles }) {
  const problems = [];
  const entries = journal.entries ?? [];
  const tags = entries.map((entry) => entry.tag);

  const seen = new Map();
  entries.forEach((entry, position) => {
    const match = NAME.exec(entry.tag);
    if (!match) {
      problems.push(`Tag "${entry.tag}" sai định dạng (cần NNNN_ten).`);
      return;
    }
    const number = Number(match[1]);
    if (seen.has(number)) {
      problems.push(`Số thứ tự ${match[1]} bị trùng: "${seen.get(number)}" và "${entry.tag}".`);
    } else {
      seen.set(number, entry.tag);
    }
    if (number !== position) {
      problems.push(
        `Số thứ tự không liên tục: "${entry.tag}" đứng ở vị trí ${position} (cần ${String(position).padStart(4, '0')}).`,
      );
    }
    if (entry.idx !== position) {
      problems.push(`Tag "${entry.tag}" có idx=${entry.idx}, cần ${position}.`);
    }
  });

  const sqlTags = new Set(
    sqlFiles.filter((name) => name.endsWith('.sql')).map((name) => name.slice(0, -4)),
  );
  for (const tag of sqlTags) {
    if (!tags.includes(tag)) problems.push(`File ${tag}.sql không có trong _journal.json.`);
  }
  for (const tag of tags) {
    if (!sqlTags.has(tag))
      problems.push(`Tag "${tag}" trong _journal.json không có file ${tag}.sql.`);
  }

  // Hai file .sql trùng số nhưng chưa vào journal cũng phải bị bắt.
  const sqlByNumber = new Map();
  for (const tag of sqlTags) {
    const match = NAME.exec(tag);
    if (!match) continue;
    const list = sqlByNumber.get(match[1]) ?? [];
    list.push(tag);
    sqlByNumber.set(match[1], list);
  }
  for (const [number, list] of sqlByNumber) {
    if (list.length > 1 && !problems.some((p) => p.includes(`${number} bị trùng`))) {
      problems.push(`Số thứ tự ${number} bị trùng giữa các file: ${list.join(', ')}.`);
    }
  }
  return problems;
}
