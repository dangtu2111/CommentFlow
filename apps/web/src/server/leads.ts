import { countLeadsByStage, type LeadRow, listLeads } from '@flow/db/runtime';
import type { LeadStage } from '@flow/shared';
import { getDb } from './db';

export type LeadsBoardData = {
  counts: Record<LeadStage, number>;
  /** Lead mới nhất trước (tối đa `BOARD_LIMIT`); chỉ bản che (4 số cuối), không có bản mã. */
  leads: LeadRow[];
};

const BOARD_LIMIT = 100;

/**
 * Dữ liệu bảng Kanban trong MỘT giao dịch `withActor` (RLS: thành viên đang hoạt động của workspace). Chỉ đọc;
 * không đụng tới `getLeadCipher` nên không có đường giải mã SĐT/email ở trang này.
 */
export async function loadLeadsBoard(workspaceId: string, userId: string): Promise<LeadsBoardData> {
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const [counts, leads] = await Promise.all([
      countLeadsByStage(tx, workspaceId),
      listLeads(tx, workspaceId, { limit: BOARD_LIMIT }),
    ]);
    return { counts, leads };
  });
}
