import {
  type ActionLogDetail,
  type ActionLogPage,
  eq,
  getActionLog,
  listActionLogActions,
  listActionLogs,
  schema,
} from '@flow/db/runtime';
import type { ActivityView } from '../lib/action-log-filters';
import { getDb } from './db';

export type ActionLogData = {
  page: ActionLogPage;
  actions: string[];
  timeZone: string;
  /** Dòng đang chọn (`l`); `null` nếu không chọn hoặc không thấy (id sai, workspace khác, Staff mở dòng người khác). */
  detail: ActionLogDetail | null;
};

/**
 * Dữ liệu trang Nhật ký trong MỘT giao dịch `withActor` (RLS: thành viên đang hoạt động của workspace). `role` lấy từ
 * `requireAppUser` (đọc lại từ DB mỗi request), không từ URL: Staff chỉ thấy dòng của chính mình (FR-092).
 */
export async function loadActionLog(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'staff',
  view: ActivityView,
): Promise<ActionLogData> {
  const viewer = { userId, role };
  const filter = {
    cursor: view.cursor,
    ...(view.actorType ? { actorType: view.actorType } : {}),
    ...(view.action ? { action: view.action } : {}),
    ...(view.fromDate ? { fromDate: view.fromDate } : {}),
    ...(view.toDate ? { toDate: view.toDate } : {}),
  };
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const [workspace] = await tx
      .select({ timezone: schema.workspaces.timezone })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId));
    const timeZone = workspace?.timezone ?? 'UTC';
    const [page, actions, detail] = await Promise.all([
      listActionLogs(tx, workspaceId, viewer, filter, timeZone),
      listActionLogActions(tx, workspaceId, viewer),
      view.selected ? getActionLog(tx, workspaceId, viewer, view.selected) : null,
    ]);
    return { page, actions, timeZone, detail };
  });
}
