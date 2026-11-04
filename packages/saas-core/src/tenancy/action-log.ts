import type { Database } from '@flow/db/runtime';
import { actionLogs } from '@flow/db/schema/core';

/**
 * Ghi nhật ký hành động của người dùng trong workspace hiện tại. PHẢI gọi bên trong cùng giao dịch `withActor` (RLS 0016: actor_type='user' đòi actor_id = người gọi, đang là thành viên)
 * với thay đổi được ghi (nếu thay đổi hỏng thì nhật ký cũng không còn). `before`/`after` chỉ chứa trường cần
 * thiết (vai trò, trạng thái), KHÔNG email/token.
 */
export async function writeActionLog(
  tx: Database,
  entry: {
    workspaceId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(actionLogs).values({
    workspaceId: entry.workspaceId,
    actorType: 'user',
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
