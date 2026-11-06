import type { ReportCommentRow } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/** Trần số dòng một lần đọc (bảo vệ bộ nhớ; vượt → `truncated`). Báo cáo tuần/tháng của một shop nằm xa dưới trần. */
export const REPORT_MAX_ROWS = 50_000;

export type LoadReportRowsInput = {
  workspaceId: string;
  /** Bao gồm. */
  from: Date;
  /** Không bao gồm. */
  to: Date;
  channelId?: string;
};

export type LoadReportRowsResult = { rows: ReportCommentRow[]; truncated: boolean };

type Raw = {
  id: string;
  channel_id: string;
  created_time: Date | string | null;
  replied_at: Date | string | null;
  replied_by: string | null;
  status: string;
  is_own: boolean;
  deleted_at: Date | string | null;
};

const toDate = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

/**
 * Đọc các cột tối thiểu của bình luận cho báo cáo (FR-083). CHỈ ĐỌC, chạy trong `withWorkspace`/`withActor` (RLS theo
 * workspace) và vẫn ép `workspace_id`. Không đọc nội dung, tên khách hay id người dùng nền tảng (nguyên tắc #6).
 * Việc lọc theo vai trò (Staff chỉ số cá nhân) do `buildReport` làm — hàm này trả dữ liệu thô của cả phạm vi.
 */
export async function loadReportRows(
  tx: Database,
  input: LoadReportRowsInput,
): Promise<LoadReportRowsResult> {
  const channel = input.channelId ? sql`AND c.channel_id = ${input.channelId}::uuid` : sql``;
  const res = await tx.execute<Raw>(sql`
    SELECT c.id, c.channel_id, c.created_time, c.replied_at, c.replied_by, c.status, c.is_own, c.deleted_at
      FROM cf.comments c
     WHERE c.workspace_id = ${input.workspaceId}::uuid
       AND c.created_time >= ${input.from.toISOString()}::timestamptz
       AND c.created_time < ${input.to.toISOString()}::timestamptz
       ${channel}
     ORDER BY c.created_time, c.id
     LIMIT ${REPORT_MAX_ROWS + 1}`);
  const truncated = res.rows.length > REPORT_MAX_ROWS;
  const rows = res.rows.slice(0, REPORT_MAX_ROWS).map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    createdTime: toDate(r.created_time),
    repliedAt: toDate(r.replied_at),
    repliedBy: r.replied_by,
    status: r.status,
    isOwn: r.is_own,
    deletedAt: toDate(r.deleted_at),
  }));
  return { rows, truncated };
}
