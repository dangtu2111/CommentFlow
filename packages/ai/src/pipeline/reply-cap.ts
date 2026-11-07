import type { ActionDecision } from '../decide/decide-action';

/**
 * TRẦN TRẢ LỜI theo (khách, bài) trong 24 giờ (FR-167, Q-POR14). Hàm thuần. `count` = số câu AI đã soạn/gửi cho cùng khách dưới
 * cùng bài trong 24 giờ (gộp mọi chuỗi và bình luận mới, KHÔNG đếm chính bình luận đang xử lý); `max` = ngưỡng 1–5 (mặc định 3).
 * - `ok`: còn chỗ → chạy bình thường;
 * - `closing`: câu này là CÂU CHỐT (chạm trần) → `redirect` mời nhắn tin theo mẫu shop + "Cần hỗ trợ thêm", không chứa sự kiện;
 * - `exceeded`: đã đủ → `needs_human`, chặn TRƯỚC extract (không tốn token).
 */
export const DEFAULT_MAX_AI_REPLIES = 3;
export const MIN_MAX_AI_REPLIES = 1;
export const MAX_MAX_AI_REPLIES = 5;

export type ReplyCapVerdict = 'ok' | 'closing' | 'exceeded';

/** Ngưỡng ngoài 1–5 hoặc không phải số nguyên → mặc định 3 (không đoán số lạ). */
export function clampMaxAiReplies(value: number | null | undefined): number {
  return Number.isInteger(value) &&
    (value as number) >= MIN_MAX_AI_REPLIES &&
    (value as number) <= MAX_MAX_AI_REPLIES
    ? (value as number)
    : DEFAULT_MAX_AI_REPLIES;
}

export function evaluateReplyCap(input: { count: number; max: number }): ReplyCapVerdict {
  const max = clampMaxAiReplies(input.max);
  const count = Number.isFinite(input.count) && input.count > 0 ? Math.floor(input.count) : 0;
  if (count >= max) return 'exceeded';
  if (count === max - 1) return 'closing';
  return 'ok';
}

/**
 * Quyết định cho câu CHỐT: chuyển hướng mời nhắn tin (mẫu `other` của shop), gắn "Cần hỗ trợ thêm", KHÔNG tự gửi (chính sách `never`
 * ở GĐ2), không có ý `fact` nào để trả lời.
 */
export function replyCapClosingDecision(): ActionDecision {
  return {
    action: 'redirect',
    reason: 'customer_post_reply_cap',
    needsHuman: false,
    needsSupportTag: true,
    clarify: null,
    answeredTopics: [],
    unansweredTopics: [],
    redirectTemplates: ['other'],
    autoSendPolicy: 'never',
    askedBefore: false,
  };
}
