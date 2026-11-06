import type { AutoPauseReason } from './auto-pause';

/** Trạng thái AI tự tạm dừng của một workspace. `pausedAt = null` → đang chạy. */
export type AutoPauseState = Readonly<{
  workspaceId: string;
  pausedAt: Date | null;
  reason?: AutoPauseReason;
}>;

export const initialAutoPauseState = (workspaceId: string): AutoPauseState => ({
  workspaceId,
  pausedAt: null,
});

/**
 * Cổng lưu trạng thái AI tự tạm dừng. `compareAndSet` nguyên tử như `EmergencyStopStore`. Bản DB cần cột/bảng mới
 * (migration làn b, gap matrix `AUTO-PAUSE-WIRE`); bản bộ nhớ CHỈ cho test/mock.
 */
export interface AutoPauseStore {
  get(workspaceId: string): Promise<AutoPauseState>;
  compareAndSet(prev: AutoPauseState, next: AutoPauseState): Promise<boolean>;
}

const same = (a: AutoPauseState, b: AutoPauseState) =>
  Object.is(a.pausedAt?.getTime(), b.pausedAt?.getTime()) && a.reason === b.reason;

export function createInMemoryAutoPauseStore(): AutoPauseStore {
  const states = new Map<string, AutoPauseState>();
  const read = (ws: string) => states.get(ws) ?? initialAutoPauseState(ws);
  return {
    async get(workspaceId) {
      return { ...read(workspaceId) };
    },
    async compareAndSet(prev, next) {
      if (prev.workspaceId !== next.workspaceId) return false;
      if (!same(read(prev.workspaceId), prev)) return false;
      states.set(next.workspaceId, { ...next });
      return true;
    },
  };
}
