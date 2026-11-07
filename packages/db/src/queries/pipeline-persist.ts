import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Truy vấn ghi kết quả pipeline (PIPE-ORCHESTRATOR lát D). Chỉ trong `withJob` của đúng workspace. Bình luận ghi qua CAS
 * `status = 'processing'` để chạy trùng không ghi hai lần (idempotent).
 */
export type CommentFinish = {
  status: 'pending_review' | 'needs_human';
  label: string | null;
  labels: ReadonlyArray<{ label: string }>;
  lang: 'vi' | 'en' | null;
  textNormalized: string;
  needsFollowup: boolean;
  followupTopics: readonly string[];
};

/** Ghi nhãn/trạng thái cuối của bình luận NẾU còn `processing`; trả `false` khi đã có job khác ghi (bỏ qua). */
export async function finishCommentProcessing(
  tx: Database,
  workspaceId: string,
  commentId: string,
  f: CommentFinish,
): Promise<boolean> {
  const r = await tx.execute<{ id: string }>(sql`
    UPDATE cf.comments SET status = ${f.status}, label = ${f.label}, label_source = 'llm',
      labels = ${JSON.stringify(f.labels)}::jsonb, lang = ${f.lang}, text_normalized = ${f.textNormalized},
      needs_followup = ${f.needsFollowup},
      followup_topics = ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(f.followupTopics)}::jsonb)),
      updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid AND status = 'processing'
     RETURNING id`);
  return r.rows.length > 0;
}

/** Khóa giao dịch theo bình luận (hai job cùng ghi "Cần nhân viên" không tạo hai bản nháp). */
export async function lockCommentForPersist(tx: Database, commentId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${commentId}, 0))`);
}

export async function commentHasDraft(
  tx: Database,
  workspaceId: string,
  commentId: string,
  /** Chỉ tính bản nháp TẠO TỪ mốc này (chạy lại thủ công, Q-POR11); thiếu = mọi bản nháp (đường tự động giữ idempotent). */
  since?: Date,
): Promise<boolean> {
  const r = await tx.execute(sql`
    SELECT 1 FROM cf.drafts WHERE workspace_id = ${workspaceId}::uuid AND target_type = 'comment'
       AND target_id = ${commentId}::uuid
       ${since ? sql`AND created_at >= ${since.toISOString()}::timestamptz` : sql``} LIMIT 1`);
  return r.rows.length > 0;
}

/**
 * Bình luận đang `processing` (hoặc `new` — bị chặn trước khi giành quyền, vd. vượt trần FR-167) → `needs_human`; không đụng trạng
 * thái khác.
 */
export async function handoffCommentIfPending(
  tx: Database,
  workspaceId: string,
  commentId: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.comments SET status = 'needs_human', updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid AND status IN ('new', 'processing')`);
}

/** Khóa lượt `failed` kèm lý do (AI lỗi/đầu ra không đọc được). */
export async function failPipelineTurn(
  tx: Database,
  workspaceId: string,
  commentId: string,
  reason: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.pipeline_turns SET state = 'failed', last_error = ${reason.slice(0, 200)}, locked_until = NULL, updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid`);
}

/**
 * Gia hạn thuê của lượt đang xử lý thêm `seconds` giây (Q-POR6). CHỈ gia hạn khi `attempts` = lượt của CHÍNH job này (token thuê):
 * job đã mất thuê (hết hạn, job khác giành lại và tăng `attempts`) không kéo dài thuê của job khác. Trả `false` = đã mất thuê.
 */
export async function extendPipelineTurnLease(
  tx: Database,
  workspaceId: string,
  commentId: string,
  attempt: number,
  seconds: number,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.pipeline_turns SET locked_until = now() + make_interval(secs => ${seconds}), updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid AND state = 'processing' AND attempts = ${attempt}
    RETURNING comment_id`);
  return r.rows.length > 0;
}

/**
 * Đường CHẠY LẠI THỦ CÔNG của nút "Soạn gợi ý" (PIPE-ORCHESTRATOR lát F, Q-POR8/Q-POR11). Chạy trong `withJob` của worker khi nhận job
 * `pipeline` `trigger: manual`. KHÔNG tự chạy pipeline và KHÔNG bỏ qua cổng: chỉ đưa bình luận/khóa lượt về trạng thái XỬ LÝ ĐƯỢC rồi để
 * cổng dừng khẩn cấp/hạn mức/trần như mọi lượt (chưa trừ lượt thì trừ; đã trừ — `charged_at` giữ nguyên — thì không trừ thêm).
 *
 *  - Chỉ nhận người yêu cầu là thành viên ĐANG HOẠT ĐỘNG của đúng workspace (job không tin `requestedBy` mù quáng).
 *  - Chỉ bình luận `new` hoặc `needs_human`, không phải của Page, chưa xóa, chưa gộp. Trạng thái khác (đang xử lý, đã có bản chờ duyệt…) → không làm gì.
 *  - `needs_human` → `new`; khóa lượt (nếu có) về `processing` với `attempts = 1` (CHECK ≥ 1; lần giành quyền kế là 2 nên còn 2 lần thử trong trần 3), nhả thuê (GIỮ `charged_at`, `last_error` xóa).
 *  - Ghi `action_logs` (người dùng yêu cầu, bình luận nào, trạng thái + lý do TRƯỚC đó; không nội dung khách).
 * Bản nháp cũ GIỮ NGUYÊN làm lịch sử; `startedAt` là mốc để ghi bản nháp MỚI dù bình luận đã có bản "Cần nhân viên" cũ (Q-POR11).
 */
export type ManualRerunResult =
  | { eligible: true; startedAt: Date; previousStatus: string; previousReason: string | null }
  | { eligible: false; reason: 'not_member' | 'not_eligible' };

export async function requestManualPipelineRun(
  tx: Database,
  workspaceId: string,
  commentId: string,
  requestedBy: string,
): Promise<ManualRerunResult> {
  const member = await tx.execute(sql`
    SELECT 1 FROM core.members
     WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${requestedBy}::uuid AND status = 'active'`);
  if (member.rows.length === 0) return { eligible: false, reason: 'not_member' };

  const found = await tx.execute<{ status: string; reason: string | null; started_at: Date }>(sql`
    SELECT c.status, now() AS started_at,
           (SELECT d.reason FROM cf.drafts d
             WHERE d.workspace_id = c.workspace_id AND d.target_type = 'comment' AND d.target_id = c.id
             ORDER BY d.created_at DESC, d.id DESC LIMIT 1) AS reason
      FROM cf.comments c
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.id = ${commentId}::uuid
       AND c.status IN ('new', 'needs_human') AND c.is_own = false AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
     FOR UPDATE OF c`);
  const row = found.rows[0];
  if (!row) return { eligible: false, reason: 'not_eligible' };

  await tx.execute(sql`
    UPDATE cf.comments SET status = 'new', updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid AND status = 'needs_human'`);
  await tx.execute(sql`
    UPDATE cf.pipeline_turns SET state = 'processing', attempts = 1, locked_until = NULL, last_error = NULL, updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid`);
  await tx.execute(sql`
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, on_behalf_of, action, target_type, target_id, after)
    VALUES (${workspaceId}::uuid, 'system', NULL, ${requestedBy}::uuid, 'comment.ai_rerun_requested', 'comment', ${commentId},
            jsonb_build_object('previous_status', ${row.status}::text, 'previous_reason', ${row.reason}::text, 'requested_by', ${requestedBy}::text))`);
  return {
    eligible: true,
    startedAt: new Date(row.started_at),
    previousStatus: row.status,
    previousReason: row.reason,
  };
}
