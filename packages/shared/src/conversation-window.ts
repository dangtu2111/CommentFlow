/**
 * Cửa sổ hội thoại tin nhắn (FR-047, docs/12 §1, BR-14): ≤ 24 giờ kể từ tin cuối của khách → AI/hệ thống tự gửi được;
 * 24 giờ–7 ngày → chỉ người (tag HUMAN_AGENT); quá 7 ngày → đóng. Biên tính CẢ mốc (elapsed ≤ ngưỡng), khớp
 * `evaluateAction` của connectors. Hàm thuần: đồng hồ do người gọi truyền vào.
 */
export const CONVERSATION_AUTO_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CONVERSATION_HUMAN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ConversationWindowState = 'open' | 'human_only' | 'closed';

export type ConversationWindow = {
  state: ConversationWindowState;
  /** Hết hạn tự động gửi; null khi chưa có tin khách. */
  autoUntil: Date | null;
  /** Hết hạn mọi cách gửi; null khi chưa có tin khách. */
  humanUntil: Date | null;
  /** ms tới lúc đổi trạng thái kế tiếp (open→human_only→closed); 0 khi đã đóng. */
  msUntilNextState: number;
};

export function conversationWindow(lastCustomerMsgAt: Date | null, now: Date): ConversationWindow {
  if (lastCustomerMsgAt === null) {
    return { state: 'closed', autoUntil: null, humanUntil: null, msUntilNextState: 0 };
  }
  const base = lastCustomerMsgAt.getTime();
  const autoUntil = new Date(base + CONVERSATION_AUTO_WINDOW_MS);
  const humanUntil = new Date(base + CONVERSATION_HUMAN_WINDOW_MS);
  // Mốc ở tương lai (lệch đồng hồ) coi như vừa nhận: elapsed âm → open.
  const elapsed = now.getTime() - base;
  if (elapsed <= CONVERSATION_AUTO_WINDOW_MS) {
    return {
      state: 'open',
      autoUntil,
      humanUntil,
      msUntilNextState: autoUntil.getTime() - now.getTime(),
    };
  }
  if (elapsed <= CONVERSATION_HUMAN_WINDOW_MS) {
    return {
      state: 'human_only',
      autoUntil,
      humanUntil,
      msUntilNextState: humanUntil.getTime() - now.getTime(),
    };
  }
  return { state: 'closed', autoUntil, humanUntil, msUntilNextState: 0 };
}
