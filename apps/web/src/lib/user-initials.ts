/**
 * Chữ viết tắt cho ảnh đại diện chữ ở khung ứng dụng: chữ đầu của từ đầu + chữ đầu của từ cuối (viết hoa).
 * Dùng `Array.from` để không cắt đôi ký tự ghép. Tên rỗng → "?".
 */
export function userInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const head = (word: string) => Array.from(word)[0] ?? '';
  return `${head(first)}${last ? head(last) : ''}`.toLocaleUpperCase('vi');
}
