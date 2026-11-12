/**
 * Kiểm đầu vào ô "Dán token System User" (thuần, không đọc DB/phiên). Giá trị từ form chỉ là DỮ LIỆU: workspace/người dùng lấy từ
 * phiên ở Server Action. Token Meta chỉ gồm chữ, số, `_` và `-`; không đoán tiền tố (Meta có thể đổi). Sai → `null`.
 */
const TOKEN = /^[A-Za-z0-9_-]{30,400}$/;

export function parseFbSystemToken(input: string): string | null {
  const value = input.trim();
  return TOKEN.test(value) ? value : null;
}
