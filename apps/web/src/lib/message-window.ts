/**
 * Cửa sổ nhắn tin của một hội thoại (docs/12, PRD Stitch): 24 giờ kể từ tin cuối của KHÁCH — trong đó AI/nhân viên
 * trả lời tự do; từ 24 giờ tới 7 ngày chỉ nhân viên (thẻ HUMAN_AGENT), AI không tự gửi; sau 7 ngày khóa hẳn.
 * Còn dưới 2 giờ thì cảnh báo (đổi màu đồng hồ). Hàm thuần: chỉ để HIỂN THỊ — cổng gửi thật vẫn do `sendRecheck` (R8).
 */
export const WINDOW_MS = 24 * 3_600_000;
export const HUMAN_AGENT_MS = 7 * 24 * 3_600_000;
export const WARNING_BELOW_MS = 2 * 3_600_000;

export type MessageWindowKind = 'open' | 'warning' | 'humanAgent' | 'locked';

export type MessageWindowState = {
  kind: MessageWindowKind;
  /** Số phút còn lại của cửa sổ đang áp dụng (làm tròn lên); 0 khi đã khóa. */
  remainingMinutes: number;
  canReply: boolean;
  autoReplyAllowed: boolean;
};

export function messageWindowState(lastCustomerMessageAt: Date, now: Date): MessageWindowState {
  const elapsed = Math.max(0, now.getTime() - lastCustomerMessageAt.getTime());
  if (elapsed < WINDOW_MS) {
    const left = WINDOW_MS - elapsed;
    return {
      kind: left < WARNING_BELOW_MS ? 'warning' : 'open',
      remainingMinutes: Math.ceil(left / 60_000),
      canReply: true,
      autoReplyAllowed: true,
    };
  }
  if (elapsed < HUMAN_AGENT_MS) {
    return {
      kind: 'humanAgent',
      remainingMinutes: Math.ceil((HUMAN_AGENT_MS - elapsed) / 60_000),
      canReply: true,
      autoReplyAllowed: false,
    };
  }
  return { kind: 'locked', remainingMinutes: 0, canReply: false, autoReplyAllowed: false };
}

/** Tách số phút thành giờ + phút để i18n ghép câu. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
