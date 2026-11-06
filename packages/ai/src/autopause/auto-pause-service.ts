import type { AutoSendDelayScheduler } from '../delay/delay-scheduler';
import type { AutoPauseDecision } from './auto-pause';
import {
  type AutoPauseState,
  type AutoPauseStore,
  initialAutoPauseState,
} from './auto-pause-store';

export type AutoPauseResumeActor = {
  workspaceId: string;
  role: 'owner' | 'staff' | 'viewer';
  userId: string;
};

export type ApplyResult = {
  /** Workspace đang ở trạng thái tạm dừng sau lệnh này. */
  paused: boolean;
  /** true = lần đặt cờ đầu tiên (nơi gọi dùng để gửi banner/thông báo đúng một lần). */
  newlyPaused: boolean;
  cancelled: number;
  cancelFailed: boolean;
  error?: 'invalid_input' | 'store_failed';
};
export type AutoPauseResumeResult =
  | { ok: true; state: AutoPauseState }
  | { ok: false; code: 'forbidden' | 'not_stopped' | 'invalid_input' };

export interface AutoPauseService {
  /** Áp quyết định của `evaluateAutoPause` cho workspace (cờ trước, rồi hủy hẹn giờ `ai_paused`). */
  apply(workspaceId: string, decision: AutoPauseDecision): Promise<ApplyResult>;
  /** Chỉ Owner (cùng quy tắc Bật lại Dừng khẩn cấp, docs/13 §3.1). */
  resume(actor: AutoPauseResumeActor): Promise<AutoPauseResumeResult>;
  /** Nuôi `aiPaused` của `sendRecheck`. Lỗi đọc/id hỏng → coi là ĐÃ DỪNG. */
  isPaused(workspaceId: string): Promise<boolean>;
}

type Deps = { store: AutoPauseStore; scheduler: AutoSendDelayScheduler; now: () => Date };
const MAX_CAS_ATTEMPTS = 3;
const validWorkspace = (id: unknown): id is string => typeof id === 'string' && id.trim() !== '';

export function createAutoPauseService({ store, scheduler, now }: Deps): AutoPauseService {
  async function sweep(workspaceId: string) {
    try {
      const { cancelled } = await scheduler.cancelAllForWorkspace(workspaceId, 'ai_paused');
      return { cancelled, cancelFailed: false };
    } catch {
      return { cancelled: 0, cancelFailed: true };
    }
  }

  /** Đặt cờ nếu chưa có; giữ nguyên lý do/giờ đầu tiên. Trả `newly`. */
  async function setPaused(
    workspaceId: string,
    reason: NonNullable<AutoPauseDecision['pauseWorkspace']>,
  ) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const prev = await store.get(workspaceId);
      if (prev.pausedAt !== null) return false;
      const next: AutoPauseState = { workspaceId, pausedAt: now(), reason: reason.reason };
      if (await store.compareAndSet(prev, next)) return true;
    }
    throw new Error('auto-pause: xung đột ghi liên tục, thử lại');
  }

  async function isPaused(workspaceId: string): Promise<boolean> {
    if (!validWorkspace(workspaceId)) return true;
    try {
      return (await store.get(workspaceId)).pausedAt !== null;
    } catch {
      return true;
    }
  }

  return {
    isPaused,
    async apply(workspaceId, decision) {
      if (!validWorkspace(workspaceId)) {
        return {
          paused: false,
          newlyPaused: false,
          cancelled: 0,
          cancelFailed: false,
          error: 'invalid_input',
        };
      }
      if (!decision.pauseWorkspace) {
        return {
          paused: await isPaused(workspaceId),
          newlyPaused: false,
          cancelled: 0,
          cancelFailed: false,
        };
      }
      let newly: boolean;
      try {
        newly = await setPaused(workspaceId, decision.pauseWorkspace);
      } catch {
        // Không ghi được cờ: vẫn hủy hẹn giờ (R4 chặn ở phút chót) rồi báo lỗi để job thử lại.
        return {
          paused: false,
          newlyPaused: false,
          error: 'store_failed',
          ...(await sweep(workspaceId)),
        };
      }
      return { paused: true, newlyPaused: newly, ...(await sweep(workspaceId)) };
    },
    async resume(actor) {
      if (actor.role !== 'owner') return { ok: false, code: 'forbidden' };
      if (!validWorkspace(actor.workspaceId) || !validWorkspace(actor.userId)) {
        return { ok: false, code: 'invalid_input' };
      }
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        const prev = await store.get(actor.workspaceId);
        if (prev.pausedAt === null) return { ok: false, code: 'not_stopped' };
        const next = initialAutoPauseState(actor.workspaceId);
        if (await store.compareAndSet(prev, next)) return { ok: true, state: next };
      }
      throw new Error('auto-pause: xung đột ghi liên tục, thử lại');
    },
  };
}
