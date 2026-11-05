import { countActionableComments } from '@flow/db/runtime';
import { type ActionableCounts, collectActionableCounts } from '../lib/workspace-count';
import { getDb } from './db';

/**
 * Số bình luận cần xử lý của từng workspace người dùng là thành viên (FR-005), mỗi workspace một giao dịch `withActor`.
 * `userId` + danh sách `memberships` lấy từ phiên server (`listWorkspacesOfUser`), không từ client. Lỗi một workspace
 * chỉ bỏ nhãn của workspace đó.
 */
export function loadActionableCounts(
  userId: string,
  memberships: ReadonlyArray<{ id: string }>,
): Promise<ActionableCounts> {
  return collectActionableCounts(memberships, (workspaceId) =>
    getDb().withActor(workspaceId, userId, (tx) => countActionableComments(tx, workspaceId)),
  );
}
