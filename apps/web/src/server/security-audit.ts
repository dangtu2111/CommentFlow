import { writeActionLog } from '@flow/saas-core';
import { type SecurityEvent, securityAuditEntry } from '../lib/security-audit';
import { getDb } from './db';

/**
 * Ghi một thay đổi bảo mật của chính người dùng vào nhật ký của workspace đang chọn (RLS: actor = người gọi, đang là
 * thành viên). Người dùng chưa có workspace (đang bật 2FA bắt buộc trước khi tạo workspace) → không có nhật ký nào để ghi.
 * Lỗi ghi KHÔNG làm hỏng thao tác đã thành công (mật khẩu/phiên đã đổi) nhưng được cảnh báo (chỉ tên sự kiện).
 */
export async function recordSecurityEvent(
  event: SecurityEvent,
  input: {
    workspaceId: string | null;
    userId: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  if (!input.workspaceId) return;
  const { workspaceId } = input;
  const entry = securityAuditEntry(event, { ...input, workspaceId });
  try {
    await getDb().withActor(workspaceId, input.userId, (tx) => writeActionLog(tx, entry));
  } catch {
    console.warn(JSON.stringify({ event: 'security_audit_failed', security_event: event }));
  }
}
