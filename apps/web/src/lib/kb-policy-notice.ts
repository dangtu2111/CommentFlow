import { z } from 'zod';

/**
 * Thông báo sau thao tác trên trang Chính sách có cấu trúc (mã đi theo `?pn=` khi chuyển hướng; không chứa nội dung). `stale` = có người/máy vừa đổi dòng này
 * (so `rev` lệch) → tải lại để xem bản mới rồi duyệt lại; `needs_review` = đề xuất còn điều kiện chưa tách được, Owner phải tick xác nhận.
 */
export const POLICY_NOTICES = [
  'approved',
  'discarded',
  'stale',
  'needs_review',
  'not_found',
  'invalid',
  'unavailable',
  'rate_limited',
] as const;
export type PolicyNotice = (typeof POLICY_NOTICES)[number];

export function policyNoticeOf(value: string | string[] | undefined): PolicyNotice | null {
  const parsed = z.enum(POLICY_NOTICES).safeParse(Array.isArray(value) ? value[0] : value);
  return parsed.success ? parsed.data : null;
}

export type PolicyActionForm =
  | { ok: true; id: string; rev: number; confirm: boolean }
  | { ok: false };

/** Đọc form Duyệt/Bỏ: `id` (uuid), `rev` (số nguyên ≥ 1, bản Owner đang xem), `confirm` (tick xác nhận điều kiện). Workspace/người dùng lấy từ phiên, không từ form. */
export function parsePolicyActionForm(data: FormData): PolicyActionForm {
  const id = z.uuid().safeParse(data.get('id'));
  const rev = z.coerce.number().int().min(1).safeParse(data.get('rev'));
  if (!id.success || !rev.success) return { ok: false };
  return { ok: true, id: id.data, rev: rev.data, confirm: data.get('confirm') === 'on' };
}
