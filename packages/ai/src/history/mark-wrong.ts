import { type AutoSentRecord, MARK_WRONG_ROLES, type MarkWrongRole } from './auto-sent-record';

export const MAX_WRONG_REASON_LENGTH = 300;

export type MarkWrongActor = { userId: string; role: MarkWrongRole };
export type MarkWrongErrorCode = 'forbidden' | 'already_marked' | 'reason_too_long';
export type MarkWrongDecision =
  | { ok: true; record: AutoSentRecord }
  | { ok: false; code: MarkWrongErrorCode };

/**
 * Quy tắc Đánh dấu sai (FR-075, Q-ASH1): Owner và Staff được; một lần duy nhất (lần hai không đổi người/giờ);
 * lý do tùy chọn, trim, ≤ 300 ký tự. Thuần: trả bản ghi mới, không sửa bản gốc.
 */
export function decideMarkWrong(
  record: AutoSentRecord,
  actor: MarkWrongActor,
  reason: string | null | undefined,
  now: Date,
): MarkWrongDecision {
  if (!MARK_WRONG_ROLES.includes(actor.role)) return { ok: false, code: 'forbidden' };
  if (record.status === 'marked_wrong') return { ok: false, code: 'already_marked' };
  const wrongReason = reason?.trim() ? reason.trim() : null;
  if (wrongReason !== null && wrongReason.length > MAX_WRONG_REASON_LENGTH) {
    return { ok: false, code: 'reason_too_long' };
  }
  return {
    ok: true,
    record: {
      ...record,
      status: 'marked_wrong',
      markedWrongAt: now,
      markedWrongBy: actor.userId,
      wrongReason,
    },
  };
}
