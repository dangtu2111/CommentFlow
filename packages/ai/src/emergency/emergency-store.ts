import { type EmergencyState, initialEmergencyState } from './emergency-stop';

/**
 * Cổng lưu trạng thái Dừng khẩn cấp (FR-073). Mọi hàm nhận `workspaceId` từ phiên server, không từ client.
 * `compareAndSet` nguyên tử: chỉ ghi khi trạng thái hiện tại còn đúng `prev` (hai người bấm Dừng cùng lúc → một bên
 * thua, đọc lại). Bản DB (`workspaces.emergency_stopped_at`, cần GRANT cột/hàm DEFINER chỉ Owner+Staff — migration
 * làn b, `EMERGENCY-STOP-WIRE`) cắm vào sau.
 */
export interface EmergencyStopStore {
  /** Chưa có → đang chạy. Luôn trả bản sao. */
  get(workspaceId: string): Promise<EmergencyState>;
  compareAndSet(prev: EmergencyState, next: EmergencyState): Promise<boolean>;
}

const sameStop = (a: EmergencyState, b: EmergencyState) =>
  Object.is(a.stoppedAt?.getTime(), b.stoppedAt?.getTime()) && a.stoppedBy === b.stoppedBy;

/** CHỈ cho test/mock, một tiến trình (mất khi khởi động lại). */
export function createInMemoryEmergencyStopStore(): EmergencyStopStore {
  const states = new Map<string, EmergencyState>();
  const read = (ws: string) => states.get(ws) ?? initialEmergencyState(ws);
  return {
    async get(workspaceId) {
      return { ...read(workspaceId) };
    },
    async compareAndSet(prev, next) {
      if (prev.workspaceId !== next.workspaceId) return false;
      if (!sameStop(read(prev.workspaceId), prev)) return false;
      states.set(next.workspaceId, { ...next });
      return true;
    },
  };
}
