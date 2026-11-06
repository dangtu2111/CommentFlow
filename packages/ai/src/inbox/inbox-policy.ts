import { CONVERSATION_AUTO_WINDOW_MS, CONVERSATION_HUMAN_WINDOW_MS } from '@flow/shared';

/**
 * Logic hộp thư tin nhắn (FR-047, docs/09 §6 cổng 11 + §6.1 R8, docs/12 §1) — hàm thuần, đồng hồ do người gọi truyền.
 * Quyền gửi dùng biên LOẠI TRỪ (`elapsed < ngưỡng`) và dung sai lệch đồng hồ giống hệt R8 của `sendRecheck`,
 * nên "được gửi" ở đây ⇔ R8 qua (có property test); lớp kiểm lại ngay trước khi gửi vẫn là `sendRecheck`.
 */

/** Mặc định tối đa lượt AI mỗi hội thoại (Q-MIL1); nơi gọi có thể truyền số khác (cấu hình workspace). */
export const DEFAULT_MAX_AI_TURNS = 5;
/** Khách hỏi lại từ ngần này lần → chuyển người (FR-047, docs/09 §6 mục 6). */
export const HANDOFF_REPEAT_LIMIT = 3;
/** "Sắp hết 24 giờ" = còn dưới ngần này (US-020). */
export const EXPIRING_SOON_MS = 2 * 3_600_000;
/** Cùng giá trị với `RECHECK_CLOCK_SKEW_MS` của sendRecheck. */
const CLOCK_SKEW_MS = 5 * 60_000;

export type InboxWindow = 'open' | 'human_only' | 'closed';
export type InboxSender = 'ai' | 'staff';
export type ConversationStatus = 'open' | 'resolved';

function isValidDate(d: Date | null): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** Cửa sổ tại `now`. Chưa có tin khách / ngày hỏng / mốc ở tương lai quá dung sai → `closed` (an toàn). */
export function inboxWindow(lastCustomerMsgAt: Date | null, now: Date): InboxWindow {
  if (!isValidDate(lastCustomerMsgAt) || !isValidDate(now)) return 'closed';
  const elapsed = now.getTime() - lastCustomerMsgAt.getTime();
  if (elapsed < -CLOCK_SKEW_MS) return 'closed';
  if (elapsed < CONVERSATION_AUTO_WINDOW_MS) return 'open';
  if (elapsed < CONVERSATION_HUMAN_WINDOW_MS) return 'human_only';
  return 'closed';
}

/** US-020: đang `open` và còn dưới 2 giờ tới mốc 24 giờ. */
export function isExpiringSoon(lastCustomerMsgAt: Date | null, now: Date): boolean {
  if (inboxWindow(lastCustomerMsgAt, now) !== 'open' || lastCustomerMsgAt === null) return false;
  const remaining = lastCustomerMsgAt.getTime() + CONVERSATION_AUTO_WINDOW_MS - now.getTime();
  return remaining < EXPIRING_SOON_MS;
}

export type InboxSendInput = {
  sender: InboxSender;
  now: Date;
  lastCustomerMsgAt: Date | null;
  status: ConversationStatus;
  aiEnabled: boolean;
  /** Số lượt AI đã trả lời trong hội thoại (`conversations.ai_turns`). */
  aiTurns: number;
  maxAiTurns: number;
};

export const INBOX_DENY_REASONS = [
  'input_invalid',
  'window_closed',
  'ai_window_expired',
  'ai_disabled',
  'conversation_resolved',
  'ai_turns_exhausted',
] as const;
export type InboxDenyReason = (typeof INBOX_DENY_REASONS)[number];

export type InboxSendDecision =
  | { allowed: true; tag: 'HUMAN_AGENT' | null }
  | { allowed: false; reason: InboxDenyReason };

const deny = (reason: InboxDenyReason): InboxSendDecision => ({ allowed: false, reason });
const isCount = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * Ai được gửi lúc này? AI: chỉ trong 24 giờ, AI bật, hội thoại chưa giải quyết, còn lượt.
 * Nhân viên: trong 24 giờ không thẻ; 24 giờ–7 ngày bắt buộc thẻ HUMAN_AGENT; quá 7 ngày khóa.
 */
export function decideInboxSend(i: InboxSendInput): InboxSendDecision {
  const window = inboxWindow(i.lastCustomerMsgAt, i.now);
  if (window === 'closed') return deny('window_closed');
  if (i.sender === 'staff')
    return { allowed: true, tag: window === 'human_only' ? 'HUMAN_AGENT' : null };
  if (!isCount(i.aiTurns) || !isCount(i.maxAiTurns)) return deny('input_invalid');
  if (window === 'human_only') return deny('ai_window_expired');
  if (!i.aiEnabled) return deny('ai_disabled');
  if (i.status === 'resolved') return deny('conversation_resolved');
  if (i.aiTurns >= i.maxAiTurns) return deny('ai_turns_exhausted');
  return { allowed: true, tag: null };
}

/**
 * Giá trị cho `sendRecheck(...).message` (R8). Nhân viên gửi chế độ `human` có thẻ HUMAN_AGENT (7 ngày); AI luôn 24 giờ.
 * Không có tin khách → `null` (R8 chặn).
 */
export function messageRecheckFor(
  sender: InboxSender,
  lastCustomerMsgAt: Date | null,
): { lastInboundAt: Date; humanAgent: boolean } | null {
  if (lastCustomerMsgAt === null) return null;
  return { lastInboundAt: lastCustomerMsgAt, humanAgent: sender === 'staff' };
}

export const INBOX_STATES = [
  'resolved',
  'expired',
  'staff_only',
  'ai_handling',
  'staff_handling',
] as const;
export type InboxState = (typeof INBOX_STATES)[number];

export type InboxStateInput = Omit<InboxSendInput, 'sender'>;

/** Trạng thái hiển thị (ưu tiên từ trên xuống): đã giải quyết → hết hạn → chỉ nhân viên → AI đang xử lý → nhân viên xử lý. */
export function deriveInboxState(i: InboxStateInput): InboxState {
  if (i.status === 'resolved') return 'resolved';
  const window = inboxWindow(i.lastCustomerMsgAt, i.now);
  if (window === 'closed') return 'expired';
  if (window === 'human_only') return 'staff_only';
  return decideInboxSend({ ...i, sender: 'ai' }).allowed ? 'ai_handling' : 'staff_handling';
}

export type HandoffDecision =
  | { handoff: false; reason: null }
  | { handoff: true; reason: 'asked_for_human' | 'repeat_limit' | 'input_invalid' };

/** FR-047: khách đòi gặp người hoặc hỏi lại ≥ 3 lần → chuyển người. Đếm hỏng → chuyển người (an toàn). */
export function shouldHandoffToHuman(i: {
  repeatCount: number;
  askedForHuman: boolean;
}): HandoffDecision {
  if (i.askedForHuman) return { handoff: true, reason: 'asked_for_human' };
  if (!isCount(i.repeatCount)) return { handoff: true, reason: 'input_invalid' };
  if (i.repeatCount >= HANDOFF_REPEAT_LIMIT) return { handoff: true, reason: 'repeat_limit' };
  return { handoff: false, reason: null };
}
