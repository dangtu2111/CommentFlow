// Chặn việc thêm allowlist vào .gitleaks.toml để "làm CI xanh".
// Chủ dự án chốt (06/11/2026): cấm agent nới cấu hình quét bí mật; chuỗi giống khóa trong test/fixture phải đổi cho
// KHÔNG giống bí mật (ngắn hoặc dựng lúc chạy). Mọi allowlist mới cần chủ dự án duyệt và được thêm vào APPROVED
// dưới đây trong CHÍNH PR được duyệt đó.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Tiền tố `description` của các allowlist đã được duyệt. */
export const APPROVED = [
  'Giá trị mẫu cố ý trong env.example',
  'Khóa ký GIẢ cho test auth',
  'Vector thử CÔNG KHAI của RFC 6238',
  "Tên trường tín hiệu 'sRetrievalTop2'",
];

/** Trả về danh sách `description` của mọi khối [[allowlists]] trong nội dung TOML. */
export function listAllowlistDescriptions(toml) {
  const blocks = toml.split(/^\[\[allowlists\]\]\s*$/m).slice(1);
  return blocks.map((block) => {
    const match = block.match(/^description\s*=\s*"([^"]*)"/m);
    return match ? match[1] : '(không có description)';
  });
}

export function findUnapproved(toml) {
  return listAllowlistDescriptions(toml).filter(
    (description) => !APPROVED.some((prefix) => description.startsWith(prefix)),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const toml = await readFile(join(ROOT, '.gitleaks.toml'), 'utf8');
  const bad = findUnapproved(toml);
  if (bad.length > 0) {
    console.error('gitleaks: có allowlist CHƯA được chủ dự án duyệt trong .gitleaks.toml:');
    for (const description of bad) console.error(`  - ${description.slice(0, 100)}`);
    console.error(
      'Không nới cấu hình quét bí mật. Đổi chuỗi giống khóa trong test/fixture thành giá trị ngắn hoặc dựng lúc chạy.',
    );
    process.exit(1);
  }
  console.log(`gitleaks-allowlist: đạt (${listAllowlistDescriptions(toml).length} mục đã duyệt)`);
}
