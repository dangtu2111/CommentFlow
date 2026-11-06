import { DELAY_SECONDS_OPTIONS } from '../automation/settings';

/**
 * Khoảng trễ trước khi tự gửi, có hủy được (FR-071, US-042, `docs/09` §6.1 dòng "Hủy trong khoảng trễ…", Q-ADC1).
 *
 * Máy trạng thái THUẦN của một câu AI đang chờ gửi: `pending` → `dispatched` (đến hạn, giao cho job `send` — job này
 * vẫn chạy `sendRecheck`) hoặc `pending` → `cancelled`. Không gọi DB/mạng/đồng hồ thật: mốc thời gian là số mili-giây
 * do nơi gọi đưa vào. Không có đường ra lệnh gửi hay ẩn bình luận; hủy chỉ đưa câu về "Chờ duyệt" hoặc mở ô sửa,
 * KHÔNG bao giờ tự gửi lại.
 *
 * - Staff hủy/sửa (`staff_cancel`/`staff_edit`): chỉ khi còn chờ (`now < runAt`); trễ 0 giây = không có cửa sổ hủy.
 * - Dừng khẩn cấp / AI tạm dừng (`emergency_stop`/`ai_paused`): hủy được tới lúc câu thật sự được giao, kể cả đã
 *   quá `runAt` (thiên về an toàn).
 * - Sai workspace → `not_found` (không lộ tồn tại). Đầu vào hỏng → `invalid_input`, không ném.
 */

export const STAFF_CANCEL_REASONS = ['staff_cancel', 'staff_edit'] as const;
export const SYSTEM_CANCEL_REASONS = ['emergency_stop', 'ai_paused'] as const;
export const CANCEL_REASONS = [...STAFF_CANCEL_REASONS, ...SYSTEM_CANCEL_REASONS] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
export type SystemCancelReason = (typeof SYSTEM_CANCEL_REASONS)[number];

/** Việc tiếp theo của câu sau khi hủy: về chờ duyệt, hoặc mở ô sửa (Staff bấm Sửa). */
export type AfterCancel = 'hold_review' | 'edit';

export type TimerStatus = 'pending' | 'cancelled' | 'dispatched';

export type AutoSendTimer = Readonly<{
  workspaceId: string;
  /** Bình luận/cuộc hội thoại sẽ được trả lời. */
  targetId: string;
  draftId: string;
  delaySeconds: number;
  scheduledAt: number;
  runAt: number;
  status: TimerStatus;
  cancelReason?: CancelReason;
  settledAt?: number;
}>;

export type PlanInput = {
  workspaceId: string;
  targetId: string;
  draftId: string;
  delaySeconds: number;
  nowMs: number;
};
export type PlanResult =
  | { ok: true; timer: AutoSendTimer }
  | { ok: false; reason: 'invalid_input' };

export type CancelInput = { workspaceId: string; reason: CancelReason; nowMs: number };
export type CancelFailure =
  | 'not_found'
  | 'too_late'
  | 'already_cancelled'
  | 'already_dispatched'
  | 'invalid_input';
export type CancelResult =
  | { ok: true; timer: AutoSendTimer; next: AfterCancel }
  | { ok: false; reason: CancelFailure };

export type ResolveResult =
  | { state: 'wait'; remainingMs: number }
  | { state: 'due' }
  | { state: 'cancelled' }
  | { state: 'dispatched' };

export type DispatchResult =
  | { ok: true; timer: AutoSendTimer }
  | { ok: false; reason: 'not_due' | 'cancelled' | 'already_dispatched' };

const isId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDelay = (v: unknown): boolean =>
  typeof v === 'number' && (DELAY_SECONDS_OPTIONS as readonly number[]).includes(v);

export function isSystemCancelReason(reason: unknown): reason is SystemCancelReason {
  return (SYSTEM_CANCEL_REASONS as readonly unknown[]).includes(reason);
}

export function planAutoSendDelay(input: PlanInput): PlanResult {
  const { workspaceId, targetId, draftId, delaySeconds, nowMs } = input;
  if (!isId(workspaceId) || !isId(targetId) || !isId(draftId) || !isTime(nowMs)) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (!isDelay(delaySeconds)) return { ok: false, reason: 'invalid_input' };
  return {
    ok: true,
    timer: {
      workspaceId,
      targetId,
      draftId,
      delaySeconds,
      scheduledAt: nowMs,
      runAt: nowMs + delaySeconds * 1000,
      status: 'pending',
    },
  };
}

export function cancelAutoSendTimer(timer: AutoSendTimer, input: CancelInput): CancelResult {
  const { workspaceId, reason, nowMs } = input;
  if (!isId(workspaceId) || !isTime(nowMs) || !(CANCEL_REASONS as readonly unknown[]).includes(reason)) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (timer.workspaceId !== workspaceId) return { ok: false, reason: 'not_found' };
  if (timer.status === 'cancelled') return { ok: false, reason: 'already_cancelled' };
  if (timer.status === 'dispatched') return { ok: false, reason: 'already_dispatched' };
  if (!isSystemCancelReason(reason) && nowMs >= timer.runAt) {
    return { ok: false, reason: 'too_late' };
  }
  return {
    ok: true,
    timer: { ...timer, status: 'cancelled', cancelReason: reason, settledAt: nowMs },
    next: reason === 'staff_edit' ? 'edit' : 'hold_review',
  };
}

export function resolveAutoSendTimer(timer: AutoSendTimer, nowMs: number): ResolveResult {
  if (timer.status === 'cancelled') return { state: 'cancelled' };
  if (timer.status === 'dispatched') return { state: 'dispatched' };
  // Mốc hỏng → coi như còn chờ (không bao giờ giao khi không chắc).
  if (!isTime(nowMs) || nowMs < timer.runAt) {
    return { state: 'wait', remainingMs: isTime(nowMs) ? timer.runAt - nowMs : timer.runAt };
  }
  return { state: 'due' };
}

/** Đến hạn → đánh dấu đã giao cho job `send` (một lần). Job `send` vẫn phải chạy `sendRecheck`. */
export function dispatchAutoSendTimer(timer: AutoSendTimer, nowMs: number): DispatchResult {
  if (timer.status === 'cancelled') return { ok: false, reason: 'cancelled' };
  if (timer.status === 'dispatched') return { ok: false, reason: 'already_dispatched' };
  if (!isTime(nowMs) || nowMs < timer.runAt) return { ok: false, reason: 'not_due' };
  return { ok: true, timer: { ...timer, status: 'dispatched', settledAt: nowMs } };
}
