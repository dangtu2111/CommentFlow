/**
 * Nhật ký kiểm toán cho thay đổi bảo mật của chính người dùng (FR-001, docs/13 §2). Thuần để test được; việc ghi vào
 * `core.action_logs` (workspace đang chọn) nằm ở `server/security-audit.ts`.
 */

export const SECURITY_EVENTS = [
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'backup_codes_regenerated',
  'session_revoked',
  'other_sessions_revoked',
] as const;

export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

/** Chi tiết cho phép ghi: danh sách trắng, chỉ số liệu — không bao giờ mật khẩu, mã, email, token. */
const ALLOWED_DETAIL = ['removed'] as const;

export function securityAuditEntry(
  event: SecurityEvent,
  input: { workspaceId: string; userId: string; detail?: Record<string, unknown> },
) {
  const after: Record<string, unknown> = {};
  for (const key of ALLOWED_DETAIL) {
    const value = input.detail?.[key];
    if (typeof value === 'number') after[key] = value;
  }
  return {
    workspaceId: input.workspaceId,
    actorId: input.userId,
    action: `security.${event}`,
    targetType: 'user',
    targetId: input.userId,
    ...(Object.keys(after).length > 0 ? { after } : {}),
  };
}
