import { loadReportRows } from '@flow/db/runtime';
import { buildReport, type Report } from '@flow/shared';
import { type ReportRange, reportWindow } from '../lib/report-view';
import { getDb } from './db';

export type ReportData = { report: Report; truncated: boolean };

/**
 * Báo cáo trong MỘT giao dịch `withActor` (RLS theo workspace). Vai trò lấy từ `requireAppUser` (không từ URL):
 * `buildReport` thu hẹp Staff về số liệu cá nhân TRƯỚC khi tính (FR-083).
 */
export async function loadReport(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'staff',
  days: ReportRange,
  now: Date = new Date(),
): Promise<ReportData> {
  const { from, to } = reportWindow(days, now);
  const { rows, truncated } = await getDb().withActor(workspaceId, userId, (tx) =>
    loadReportRows(tx, { workspaceId, from, to }),
  );
  return { report: buildReport(rows, { role, userId }, { from, to }), truncated };
}
