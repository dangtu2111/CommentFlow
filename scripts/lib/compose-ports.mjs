// Kiểm cổng Postgres trong file compose: mọi mục `ports` của service `postgres` phải bắt đầu bằng 127.0.0.1:
// (loopback). Đọc theo dòng/thụt lề, không thêm thư viện YAML. Dạng object (`target:/published:`) bị coi là đỏ
// vì không kiểm được host_ip bằng cách đọc chuỗi — dùng dạng chuỗi.

const LOOPBACK = /^127\.0\.0\.1:/;
const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === '' || line.trimStart().startsWith('#');

function postgresBlock(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^ {2}postgres:\s*(#.*)?$/.test(l));
  if (start === -1) return [];
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (!isBlank(line) && indentOf(line) <= 2) break;
    block.push(line);
  }
  return block;
}

const unquote = (s) => s.trim().replace(/^["']|["']$/g, '');

/** Các mục `ports` (chuỗi gốc) của service postgres; mục dạng object trả về dòng thô (không loopback → đỏ). */
export function postgresPorts(text) {
  const block = postgresBlock(text);
  const at = block.findIndex((l) => /^ {4}ports:/.test(l));
  if (at === -1) return [];
  const inline = block[at].replace(/^ {4}ports:\s*/, '').replace(/\s+#.*$/, '');
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(/,(?=\s*["'\d])/)
      .map(unquote)
      .filter(Boolean);
  }
  const items = [];
  for (const line of block.slice(at + 1)) {
    if (isBlank(line)) continue;
    if (indentOf(line) <= 4) break;
    const m = line.match(/^\s*-\s+(.*?)\s*(#.*)?$/);
    if (m) items.push(unquote(m[1]));
  }
  return items;
}

/** Mục `ports` của postgres KHÔNG bắt đầu bằng 127.0.0.1: (rỗng = đạt). */
export function findNonLoopbackPostgresPorts(text) {
  return postgresPorts(text).filter((p) => !LOOPBACK.test(p));
}
