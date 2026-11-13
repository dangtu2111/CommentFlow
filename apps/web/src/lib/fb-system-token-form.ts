/**
 * Kiểm đầu vào ô "Dán token System User" (thuần, không đọc DB/phiên). Giá trị từ form chỉ là DỮ LIỆU: workspace/người dùng lấy từ
 * phiên ở Server Action. Token Meta chỉ gồm chữ, số, `_` và `-`; không đoán tiền tố (Meta có thể đổi). Độ dài: Meta không đảm bảo mức tối đa
 * và token nhiều quyền dài hơn token ít quyền, nên cho tới 2048 ký tự (vẫn là trần chống dữ liệu rác). Sai → `null`.
 */
const MIN_LENGTH = 30;
const MAX_LENGTH = 2048;
const CHARSET = /^[A-Za-z0-9_-]+$/;

export type FbSystemTokenDiagnosis = 'ok' | 'empty' | 'too_short' | 'too_long' | 'bad_chars';

/** Lý do một chuỗi bị từ chối — CHỈ loại lý do (dùng để ghi nhật ký và hướng dẫn người dùng), không bao giờ trả lại giá trị đã dán. */
export function diagnoseFbSystemToken(input: string): FbSystemTokenDiagnosis {
  const value = input.trim();
  if (value === '') return 'empty';
  if (!CHARSET.test(value)) return 'bad_chars';
  if (value.length < MIN_LENGTH) return 'too_short';
  if (value.length > MAX_LENGTH) return 'too_long';
  return 'ok';
}

export function parseFbSystemToken(input: string): string | null {
  return diagnoseFbSystemToken(input) === 'ok' ? input.trim() : null;
}
