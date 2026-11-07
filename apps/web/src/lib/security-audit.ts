/**
 * Nhật ký kiểm toán cho thay đổi bảo mật của chính người dùng (FR-001, docs/13 §2). Thuần để test được; việc ghi vào
 * `core.action_logs` (workspace đang chọn) nằm ở `server/security-audit.ts`.
 */

export const SECURITY_EVENTS = [
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'backup_codes_regenerated',
  'backup_codes_viewed',
  'session_revoked',
  'other_sessions_revoked',
  'profile_updated',
  'avatar_changed',
  'avatar_removed',
  'phone_otp_sent',
  'phone_verified',
] as const;

export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

/** Chi tiết cho phép ghi: danh sách trắng, chỉ số liệu — không bao giờ mật khẩu, mã, email, token. */
const ALLOWED_DETAIL = ['removed'] as const;
/** Tên trường hồ sơ được phép ghi vào `fields` (chỉ TÊN, không giá trị). */
const PROFILE_FIELDS: readonly string[] = ['name', 'timezone', 'theme'];

export function securityAuditEntry(
  event: SecurityEvent,
  input: { workspaceId: string; userId: string; detail?: Record<string, unknown> },
) {
  const after: Record<string, unknown> = {};
  for (const key of ALLOWED_DETAIL) {
    const value = input.detail?.[key];
    if (typeof value === 'number') after[key] = value;
  }
  const fields = input.detail?.fields;
  if (event === 'profile_updated' && Array.isArray(fields)) {
    const names = fields.filter(
      (f): f is string => typeof f === 'string' && PROFILE_FIELDS.includes(f),
    );
    if (names.length > 0) after.fields = names;
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
