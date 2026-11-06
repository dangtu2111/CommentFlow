import { z } from 'zod';

/**
 * Người đang giữ chuỗi (DA-HOLDER, FR-154, US-110, Q-DH1, `docs/09` §6 mục 6): nhân viên đã trả lời trong cùng
 * chuỗi trong `human_hold_minutes` gần nhất (mặc định 120, Owner chỉnh) → AI chỉ gợi ý, không tự gửi.
 * Hàm thuần, không DB/LLM; kết quả `holding` nuôi cờ `flags.humanHolding` của `decideAutoSend` (cổng 6).
 * Chỉ tin của NHÂN VIÊN tính (AI, khách, Page khác không). Đầu vào hỏng → giữ (thiên về chặn, không ném).
 * Quy tắc này chỉ CHẶN tự gửi; không có đường nào ẩn bình luận hay tự gửi thay người.
 */

export const DEFAULT_HUMAN_HOLD_MINUTES = 120;
/** Trần 24 giờ: giá trị cột lớn hơn coi là hỏng → dùng mặc định. */
export const MAX_HUMAN_HOLD_MINUTES = 1440;

const MINUTE_MS = 60_000;

const threadEventSchema = z.object({
  // Giá trị lạ (vd 'Staff', 'owner') → đầu vào hỏng → giữ; không âm thầm coi là "không phải nhân viên".
  by: z.enum(['staff', 'ai', 'customer', 'other']),
  at: z.date().refine((value) => !Number.isNaN(value.getTime())),
});

const inputSchema = z.object({
  now: z.date().refine((value) => !Number.isNaN(value.getTime())),
  thread: z.array(threadEventSchema),
  holdMinutes: z.unknown().optional(),
});

export type HumanHoldReason = 'staff_replied_recently' | 'none' | 'disabled' | 'unreadable';

export type HumanHoldResult = {
  /** Nhân viên đang giữ chuỗi → cổng tự gửi phải chặn. */
  holding: boolean;
  reason: HumanHoldReason;
  /** Lúc nhả giữ chuỗi (nếu không có tin mới); `null` khi không giữ hoặc không đọc được. */
  heldUntil: Date | null;
};

const UNREADABLE: HumanHoldResult = { holding: true, reason: 'unreadable', heldUntil: null };

/** Số phút giữ: số nguyên 0..1440 (0 = Owner tắt); mọi giá trị khác → mặc định, không bao giờ tắt ngầm. */
function readHoldMinutes(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_HUMAN_HOLD_MINUTES
    ? value
    : DEFAULT_HUMAN_HOLD_MINUTES;
}

export function evaluateHumanHold(raw: unknown): HumanHoldResult {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return UNREADABLE;
  const { now, thread } = parsed.data;
  const holdMinutes = readHoldMinutes(parsed.data.holdMinutes);
  if (holdMinutes === 0) return { holding: false, reason: 'disabled', heldUntil: null };

  const staffTimes = thread.filter((event) => event.by === 'staff').map((e) => e.at.getTime());
  if (staffTimes.length === 0) return { holding: false, reason: 'none', heldUntil: null };

  // Tin mới nhất quyết định; tin ở tương lai (lệch đồng hồ) vẫn tính là đang giữ.
  const heldUntilMs = staffTimes.reduce((a, b) => Math.max(a, b)) + holdMinutes * MINUTE_MS;
  if (heldUntilMs <= now.getTime()) return { holding: false, reason: 'none', heldUntil: null };
  const heldUntil = new Date(heldUntilMs);
  return {
    holding: true,
    reason: 'staff_replied_recently',
    heldUntil: Number.isNaN(heldUntil.getTime()) ? null : heldUntil,
  };
}
