import type { AutoSendDelayScheduler } from '../delay/delay-scheduler';
import {
  decideEmergencyChange,
  EMERGENCY_STOP_ROLES,
  type EmergencyAction,
  type EmergencyActorRole,
  type EmergencyChangeErrorCode,
  type EmergencyState,
  isEmergencyStopped,
} from './emergency-stop';
import type { EmergencyStopStore } from './emergency-store';

export type EmergencyActor = { workspaceId: string; role: EmergencyActorRole; userId: string };
export type StopResult =
  | { ok: true; state: EmergencyState; cancelled: number; cancelFailed: boolean }
  | { ok: false; code: 'already_stopped'; cancelled: number; cancelFailed: boolean }
  /** Không ghi được cờ (store lỗi) nhưng hẹn giờ đã được hủy; người dùng phải bấm lại. */
  | { ok: false; code: 'store_failed'; cancelled: number; cancelFailed: boolean }
  | { ok: false; code: Exclude<EmergencyChangeErrorCode, 'already_stopped' | 'not_stopped'> };
export type ResumeResult =
  | { ok: true; state: EmergencyState }
  | { ok: false; code: Exclude<EmergencyChangeErrorCode, 'already_stopped'> };

export interface EmergencyStopService {
  stop(actor: EmergencyActor): Promise<StopResult>;
  resume(actor: EmergencyActor): Promise<ResumeResult>;
  /** Cờ nuôi `workspace.emergencyStopped` của `decideAutoSend`/`sendRecheck`. Lỗi đọc → coi là ĐÃ DỪNG. */
  isStopped(workspaceId: string): Promise<boolean>;
}

type Deps = { store: EmergencyStopStore; scheduler: AutoSendDelayScheduler; now: () => Date };
const MAX_CAS_ATTEMPTS = 3;

/**
 * Dừng: đặt cờ TRƯỚC, rồi hủy mọi hẹn giờ chưa giao (`emergency_stop`). Hủy lỗi → cờ giữ nguyên (không hoàn tác),
 * báo `cancelFailed`; `sendRecheck` R4 chặn ở phút chót. Dừng lặp lại vẫn quét hẹn giờ lọt vào sau. Bật lại chỉ xóa
 * cờ — không hồi sinh câu đã hủy. Vai trò do nơi gọi lấy từ phiên server (`requireAppUser`), không từ client.
 */
export function createEmergencyStopService({ store, scheduler, now }: Deps): EmergencyStopService {
  const validWorkspace = (id: unknown): id is string => typeof id === 'string' && id.trim() !== '';

  async function change(actor: EmergencyActor, action: EmergencyAction) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const prev = await store.get(actor.workspaceId);
      const decision = decideEmergencyChange(
        prev,
        { action, role: actor.role, userId: actor.userId },
        now(),
      );
      if (!decision.ok) return decision;
      if (await store.compareAndSet(prev, decision.state)) return decision;
    }
    throw new Error('emergency-stop: xung đột ghi liên tục, thử lại');
  }

  async function sweep(workspaceId: string) {
    try {
      const { cancelled } = await scheduler.cancelAllForWorkspace(workspaceId, 'emergency_stop');
      return { cancelled, cancelFailed: false };
    } catch {
      return { cancelled: 0, cancelFailed: true };
    }
  }

  return {
    async stop(actor) {
      if (!validWorkspace(actor.workspaceId)) return { ok: false, code: 'invalid_input' };
      let r: Awaited<ReturnType<typeof change>>;
      try {
        r = await change(actor, 'stop');
      } catch {
        // Store hỏng/xung đột: vẫn hủy hẹn giờ (docs/09 R4) rồi báo lỗi — không để việc hủy phụ thuộc việc ghi cờ.
        if (!(EMERGENCY_STOP_ROLES as readonly string[]).includes(actor.role)) {
          return { ok: false, code: 'forbidden' };
        }
        return { ok: false, code: 'store_failed', ...(await sweep(actor.workspaceId)) };
      }
      if (r.ok) return { ok: true, state: r.state, ...(await sweep(actor.workspaceId)) };
      if (r.code === 'already_stopped') {
        return { ok: false, code: 'already_stopped', ...(await sweep(actor.workspaceId)) };
      }
      // `not_stopped` chỉ có ở hành động Bật lại — không thể xảy ra ở Dừng.
      return { ok: false, code: r.code as Exclude<typeof r.code, 'not_stopped'> };
    },
    async resume(actor) {
      if (!validWorkspace(actor.workspaceId)) return { ok: false, code: 'invalid_input' };
      const r = await change(actor, 'resume');
      if (r.ok) return { ok: true, state: r.state };
      // `already_stopped` chỉ có ở hành động Dừng — không thể xảy ra ở Bật lại.
      return { ok: false, code: r.code as Exclude<typeof r.code, 'already_stopped'> };
    },
    async isStopped(workspaceId) {
      if (!validWorkspace(workspaceId)) return true;
      try {
        return isEmergencyStopped(await store.get(workspaceId));
      } catch {
        return true;
      }
    },
  };
}
