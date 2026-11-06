/**
 * Dừng khẩn cấp tự gửi theo workspace (FR-073, US-043, `docs/09` §6 cổng 1 + §6.1 R4, `docs/13` §3.1, Q-ES1).
 *
 * Quy tắc THUẦN (không DB/mạng/đồng hồ thật): ai được Dừng, ai được Bật lại, lặp lại có an toàn không.
 * - Dừng: Owner + Staff. Bật lại: chỉ Owner. Vai trò khác/hỏng → `forbidden` (từ chối trước mọi kiểm tra khác).
 * - Dừng lần hai không ghi đè giờ/người dừng đầu tiên (`already_stopped`); Bật lại khi chưa dừng → `not_stopped`.
 * - Giá trị cột `emergency_stopped_at` hỏng (Date không hợp lệ) → coi là ĐÃ DỪNG (thiên về an toàn).
 * Cờ `isEmergencyStopped` là nguồn cho `workspace.emergencyStopped` của `decideAutoSend` và `sendRecheck` (R4).
 */

export const EMERGENCY_STOP_ROLES = ['owner', 'staff'] as const;
export const EMERGENCY_RESUME_ROLES = ['owner'] as const;
export type EmergencyStopRole = (typeof EMERGENCY_STOP_ROLES)[number];
/** Mọi vai trò có thể gặp ở phiên; chỉ `EMERGENCY_STOP_ROLES` được Dừng. */
export type EmergencyActorRole = EmergencyStopRole | 'viewer';
export type EmergencyAction = 'stop' | 'resume';

export type EmergencyState = Readonly<{
  workspaceId: string;
  /** null = đang chạy bình thường. */
  stoppedAt: Date | null;
  stoppedBy?: string;
}>;

export type EmergencyChange = {
  action: EmergencyAction;
  role: EmergencyActorRole;
  userId: string;
};
export type EmergencyChangeErrorCode =
  | 'forbidden'
  | 'already_stopped'
  | 'not_stopped'
  | 'invalid_input';
export type EmergencyChangeResult =
  | { ok: true; state: EmergencyState }
  | { ok: false; code: EmergencyChangeErrorCode };

export function initialEmergencyState(workspaceId: string): EmergencyState {
  return { workspaceId, stoppedAt: null };
}

/** Từ cột `workspaces.emergency_stopped_at`. Giá trị hỏng → đã dừng (fail-safe). */
export function stateFromStoppedAt(
  workspaceId: string,
  stoppedAt: Date | null,
  stoppedBy?: string,
): EmergencyState {
  if (stoppedAt === null) return initialEmergencyState(workspaceId);
  return { workspaceId, stoppedAt, ...(stoppedBy ? { stoppedBy } : {}) };
}

export function isEmergencyStopped(state: EmergencyState): boolean {
  return state.stoppedAt !== null;
}

const allowed = (roles: readonly string[], role: unknown): boolean =>
  typeof role === 'string' && roles.includes(role);

export function decideEmergencyChange(
  state: EmergencyState,
  change: EmergencyChange,
  now: Date,
): EmergencyChangeResult {
  if (change.action !== 'stop' && change.action !== 'resume') {
    return { ok: false, code: 'invalid_input' };
  }
  const roles = change.action === 'stop' ? EMERGENCY_STOP_ROLES : EMERGENCY_RESUME_ROLES;
  if (!allowed(roles, change.role)) return { ok: false, code: 'forbidden' };
  if (typeof change.userId !== 'string' || change.userId.trim() === '') {
    return { ok: false, code: 'invalid_input' };
  }
  if (change.action === 'stop') {
    if (isEmergencyStopped(state)) return { ok: false, code: 'already_stopped' };
    return {
      ok: true,
      state: { workspaceId: state.workspaceId, stoppedAt: now, stoppedBy: change.userId },
    };
  }
  if (!isEmergencyStopped(state)) return { ok: false, code: 'not_stopped' };
  return { ok: true, state: initialEmergencyState(state.workspaceId) };
}
