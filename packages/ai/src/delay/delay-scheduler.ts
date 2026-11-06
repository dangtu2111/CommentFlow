import {
  type AutoSendTimer,
  type CancelReason,
  type CancelResult,
  cancelAutoSendTimer,
  dispatchAutoSendTimer,
  isSystemCancelReason,
  planAutoSendDelay,
  type SystemCancelReason,
} from './auto-send-delay';

export type ScheduleInput = {
  workspaceId: string;
  targetId: string;
  draftId: string;
  delaySeconds: number;
};
export type ScheduleResult =
  | { ok: true; timer: AutoSendTimer }
  | { ok: false; reason: 'invalid_input' | 'duplicate' };

/**
 * Cổng hẹn giờ tự gửi (FR-071, US-042). Khóa luôn là `(workspaceId, draftId)` — workspace lấy từ phiên server, không
 * từ client. Bản bộ nhớ dưới đây dùng cho test/mock; bản bền (job pg-boss `send` với `startAfter` + cột lưu hẹn giờ)
 * cắm vào ở `AUTO-DELAY-WIRE` (làn b). Job `send` khi chạy vẫn phải `sendRecheck`.
 */
export interface AutoSendDelayScheduler {
  /** Hẹn lại cùng (workspace, draft) → `duplicate`, không kéo dài giờ. */
  schedule(input: ScheduleInput): Promise<ScheduleResult>;
  /** Staff hủy/sửa (chỉ khi còn chờ) hoặc hệ thống hủy một câu. */
  cancel(workspaceId: string, draftId: string, reason: CancelReason): Promise<CancelResult>;
  /** Dừng khẩn cấp / AI tạm dừng: hủy mọi câu chưa giao của workspace. Chỉ nhận lý do hệ thống. */
  cancelAllForWorkspace(
    workspaceId: string,
    reason: SystemCancelReason,
  ): Promise<{ cancelled: number }>;
  /** Lấy các câu đã đến hạn, đánh dấu đã giao — mỗi câu chỉ được giao đúng một lần. */
  claimDue(): Promise<AutoSendTimer[]>;
}

const keyOf = (workspaceId: string, draftId: string) => `${workspaceId}\u0000${draftId}`;

/**
 * CHỈ cho test/mock, một tiến trình. KHÔNG dùng ở môi trường nhiều tiến trình (web + worker): lệnh hủy gửi tới tiến
 * trình khác sẽ không thấy hẹn giờ. Bản thật: `AUTO-DELAY-WIRE` (so giờ bằng `now()` của DB trong một câu lệnh nguyên tử).
 */
export function createInMemoryAutoSendDelayScheduler(
  now: () => number = () => Date.now(),
): AutoSendDelayScheduler {
  const timers = new Map<string, AutoSendTimer>();
  return {
    async schedule(input) {
      const planned = planAutoSendDelay({ ...input, nowMs: now() });
      if (!planned.ok) return planned;
      const key = keyOf(input.workspaceId, input.draftId);
      if (timers.has(key)) return { ok: false, reason: 'duplicate' };
      timers.set(key, planned.timer);
      return planned;
    },
    async cancel(workspaceId, draftId, reason) {
      const timer = timers.get(keyOf(workspaceId, draftId));
      if (!timer) return { ok: false, reason: 'not_found' };
      const result = cancelAutoSendTimer(timer, { workspaceId, reason, nowMs: now() });
      if (result.ok) timers.set(keyOf(workspaceId, draftId), result.timer);
      return result;
    },
    async cancelAllForWorkspace(workspaceId, reason) {
      if (!isSystemCancelReason(reason)) {
        throw new Error('cancelAllForWorkspace chỉ nhận lý do hệ thống');
      }
      // Dừng khẩn cấp không được "thành công giả": đầu vào/đồng hồ hỏng → ném, không trả 0 lặng lẽ.
      if (typeof workspaceId !== 'string' || workspaceId.trim() === '' || !Number.isFinite(now())) {
        throw new Error('cancelAllForWorkspace: workspaceId hoặc đồng hồ không hợp lệ');
      }
      let cancelled = 0;
      for (const [key, timer] of timers) {
        if (timer.workspaceId !== workspaceId) continue;
        const result = cancelAutoSendTimer(timer, { workspaceId, reason, nowMs: now() });
        if (result.ok) {
          timers.set(key, result.timer);
          cancelled += 1;
        }
      }
      return { cancelled };
    },
    async claimDue() {
      const claimed: AutoSendTimer[] = [];
      for (const [key, timer] of timers) {
        const result = dispatchAutoSendTimer(timer, now());
        if (result.ok) {
          timers.set(key, result.timer);
          claimed.push(result.timer);
        }
      }
      return claimed;
    },
  };
}
