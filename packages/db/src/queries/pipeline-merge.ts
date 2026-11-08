import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Gộp bình luận (FR-148, PIPE-ORCHESTRATOR lát E): các bình luận CHƯA xử lý cùng khách + cùng bài đến sát nhau (trong
 * `windowSeconds`) thành MỘT lượt. Bình luận CUỐI của nhóm là bình luận chính (bản nháp gắn vào đó, khóa lượt theo nó); các bình
 * luận trước đặt `merged_into_id` = chính và `status = 'skipped'` (không còn đứng chờ). Chỉ trong `withJob` của đúng workspace.
 * Bình luận nhập ngược (`backfill`) KHÔNG bao giờ được gộp vào (FR-011). Idempotent: chạy lại → cùng kết quả, không gộp thêm.
 */
export type MergedGroup = {
  /** Bình luận chính (cuối nhóm; = `commentId` khi không có gì để gộp). */
  mainId: string;
  /** Văn bản GỐC (chưa che PII) theo thứ tự thời gian, đã gồm bình luận chính. */
  texts: string[];
  /** Các bình luận vừa được gộp vào bình luận chính. */
  mergedIds: string[];
};

export async function getMergeWindowSeconds(
  tx: Database,
  workspaceId: string,
  fallback: number,
): Promise<number> {
  const r = await tx.execute<{ merge_window_seconds: number }>(sql`
    SELECT merge_window_seconds FROM cf.automation_settings WHERE workspace_id = ${workspaceId}::uuid`);
  return r.rows[0]?.merge_window_seconds ?? fallback;
}

export async function mergeCommentGroup(
  tx: Database,
  workspaceId: string,
  commentId: string,
  windowSeconds: number,
): Promise<MergedGroup> {
  const alone: MergedGroup = { mainId: commentId, texts: [], mergedIds: [] };
  if (windowSeconds <= 0) return alone;
  const group = await tx.execute<{ id: string; text: string; created_time: Date }>(sql`
    WITH me AS (
      SELECT post_id, author_external_id, coalesce(created_time, created_at) AS created_time FROM cf.comments
       WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid
         AND status = 'new' AND ingest_source <> 'backfill' AND is_own = false AND deleted_at IS NULL AND merged_into_id IS NULL
    )
    SELECT c.id, c.text, coalesce(c.created_time, c.created_at) AS created_time FROM cf.comments c, me
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.post_id = me.post_id AND c.author_external_id = me.author_external_id
       AND c.status = 'new' AND c.ingest_source <> 'backfill' AND c.is_own = false AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
       AND coalesce(c.created_time, c.created_at) BETWEEN me.created_time - make_interval(secs => ${windowSeconds})
                              AND me.created_time + make_interval(secs => ${windowSeconds})
     ORDER BY coalesce(c.created_time, c.created_at), c.id
     FOR UPDATE OF c`);
  if (group.rows.length <= 1) return alone;
  const main = group.rows[group.rows.length - 1];
  if (!main) return alone;
  const mergedIds = group.rows.slice(0, -1).map((r) => r.id);
  await tx.execute(sql`
    UPDATE cf.comments SET merged_into_id = ${main.id}::uuid, status = 'skipped', updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id IN (${sql.join(
       mergedIds.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
       AND status = 'new'`);
  return { mainId: main.id, texts: group.rows.map((r) => r.text), mergedIds };
}

export type PendingPipelineComment = {
  workspaceId: string;
  commentId: string;
  ingestSource: string;
  /** Đã có dòng `pipeline_turns` (từng xử lý hoặc nhân viên đã bấm "Soạn gợi ý"). */
  hasTurn: boolean;
};

/**
 * Bình luận chờ xử lý AI cho job quét (hàm DEFINER `cf.list_pending_pipeline_comments`, migration 0074): chỉ id + nguồn; BỎ QUA
 * workspace đang dừng khẩn cấp (Q-POR7) và bình luận backfill chưa từng có lượt (FR-011). Gọi ở NGỮ CẢNH TRẦN (`withSystem`).
 */
export async function listPendingPipelineComments(
  tx: Database,
  options: {
    newAfterSeconds: number;
    processingAfterSeconds: number;
    workspaceIds: readonly string[];
    limit: number;
  },
): Promise<PendingPipelineComment[]> {
  const ids = `{${options.workspaceIds.join(',')}}`;
  const r = await tx.execute<{
    workspace_id: string;
    comment_id: string;
    ingest_source: string;
    has_turn: boolean;
  }>(sql`
    SELECT * FROM cf.list_pending_pipeline_comments(
      ${options.newAfterSeconds}::int, ${options.processingAfterSeconds}::int, ${ids}::uuid[], ${options.limit}::int)`);
  return r.rows.map((row) => ({
    workspaceId: row.workspace_id,
    commentId: row.comment_id,
    ingestSource: row.ingest_source,
    hasTurn: row.has_turn,
  }));
}

/**
 * Workspace đang có bình luận cần quét — CẢ `new` quá hạn, `processing` kẹt và bình luận đã có lượt, cùng điều kiện với `listPendingPipelineComments`
 * (hàm DEFINER `cf.list_workspaces_with_pending_pipeline_comments`, 0082; chung hàm nội bộ `pipeline_pending_rows`), workspace chờ CŨ NHẤT trước: CHỈ id workspace. Job quét lọc
 * từng workspace bằng cờ `cf.pipeline.v2` rồi mới gọi `listPendingPipelineComments`. Gọi ở NGỮ CẢNH TRẦN (`withSystem`) của kết nối worker.
 */
export async function listWorkspacesWithPendingPipelineComments(
  tx: Database,
  options: { newAfterSeconds: number; processingAfterSeconds: number; limit: number },
): Promise<string[]> {
  const r = await tx.execute<{ workspace_id: string }>(sql`
    SELECT workspace_id FROM cf.list_workspaces_with_pending_pipeline_comments(
      ${options.newAfterSeconds}::int, ${options.processingAfterSeconds}::int, ${options.limit}::int)`);
  return r.rows.map((row) => row.workspace_id);
}
