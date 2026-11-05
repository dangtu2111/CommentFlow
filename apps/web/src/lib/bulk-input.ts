import { type CommentLabel, isCommentLabel } from '@flow/shared';
import { z } from 'zod';

/** Trần số bình luận mỗi lần hành động hàng loạt (FR-045; Q4 trong QUYET_DINH_CHO_DUYET). */
export const BULK_MAX = 50;

export type BulkInputRejection = 'invalid_input' | 'too_many' | 'invalid_label';

const uuidList = z.array(z.uuid());

/** Kiểm danh sách id từ client: mảng UUID không rỗng, khử trùng (giữ thứ tự), tối đa `BULK_MAX`. */
export function parseBulkIds(
  input: unknown,
): { ok: true; ids: string[] } | { ok: false; reason: 'invalid_input' | 'too_many' } {
  const parsed = uuidList.safeParse(input);
  if (!parsed.success || parsed.data.length === 0) return { ok: false, reason: 'invalid_input' };
  const ids = [...new Set(parsed.data)];
  if (ids.length > BULK_MAX) return { ok: false, reason: 'too_many' };
  return { ok: true, ids };
}

export function parseBulkLabel(
  input: unknown,
): { ok: true; label: CommentLabel } | { ok: false; reason: 'invalid_label' } {
  return isCommentLabel(input)
    ? { ok: true, label: input }
    : { ok: false, reason: 'invalid_label' };
}
