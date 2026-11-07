import { type MaskedText, maskPii } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Ngữ cảnh hội thoại cho job `pipeline` (PIPE-CONVO-CONTEXT, Q-POR12; FR-137/FR-144) và số câu AI đã trả cho (khách, bài) trong 24
 * giờ (FR-167, Q-POR14). CHỈ ĐỌC, lọc `workspace_id`. MỌI văn bản trả về ĐÃ che PII (`maskPii`) — nơi gọi đưa thẳng vào prompt
 * (nguyên tắc #6). Giới hạn: ≤ 5 lượt gần nhất trong chuỗi (gồm câu shop đã gửi), ≤ 3 câu hỏi cùng khách ở bài khác trong 7 ngày.
 */
export const MAX_THREAD_TURNS = 5;
export const MAX_OTHER_POST_QUESTIONS = 3;
export const OTHER_POST_WINDOW_DAYS = 7;
/** Cửa sổ đếm trần trả lời (FR-167) — cố định ở mã, không cho Owner chỉnh. */
export const REPLY_CAP_WINDOW_HOURS = 24;

export type ConvoTurn = { from: 'customer' | 'shop'; text: MaskedText; at: Date };
export type ConvoOtherQuestion = { postId: string; text: MaskedText; at: Date };

export type PipelineConvo = {
  /** Cũ → mới, ≤ 5, gồm câu shop đã gửi. */
  turns: ConvoTurn[];
  parentComment: MaskedText | null;
  postCaption: MaskedText | null;
  /** Tên sản phẩm gắn bài đã xác nhận (sản phẩm chính trước). */
  postProductNames: string[];
  /** Mới → cũ, ≤ 3, ở bài khác trong 7 ngày. */
  otherQuestions: ConvoOtherQuestion[];
  /** Cột jsonb THÔ `{productIds, pendingAsks}` từ bản nháp gần nhất của chuỗi (nơi gọi kiểm bằng Zod); `null` = chưa có. */
  stateRaw: unknown;
};

type Anchor = {
  workspaceId: string;
  commentId: string;
  postId: string;
  authorExternalId: string;
  parentExternalId: string | null;
  channelId: string;
  postCaption: string | null;
  createdTime: Date;
  now: Date;
};

const asDate = (v: string | Date): Date => new Date(v);

/** Số câu AI đã soạn/gửi cho (khách, bài) trong 24 giờ — gộp MỌI chuỗi và bình luận mới (FR-167); không tính bình luận `exclude`. */
export async function countCustomerPostReplies(
  tx: Database,
  workspaceId: string,
  postId: string,
  authorExternalId: string,
  now: Date,
  excludeCommentId?: string,
): Promise<number> {
  const r = await tx.execute<{ n: string }>(sql`
    SELECT count(*) AS n
      FROM cf.drafts d
      JOIN cf.comments c ON c.workspace_id = d.workspace_id AND c.id = d.target_id
     WHERE d.workspace_id = ${workspaceId}::uuid AND d.target_type = 'comment'
       AND c.post_id = ${postId}::uuid AND c.author_external_id = ${authorExternalId}
       AND d.created_at > ${now.toISOString()}::timestamptz - make_interval(hours => ${REPLY_CAP_WINDOW_HOURS})
       AND d.action IN ('answer', 'clarify', 'redirect')
       ${excludeCommentId ? sql`AND d.target_id <> ${excludeCommentId}::uuid` : sql``}`);
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Số câu AI đã có cho (khách, bài) của MỘT bình luận (tra theo id bình luận) trong 24 giờ — để xếp độ ưu tiên hàng đợi: bình luận
 * ĐẦU TIÊN của khách dưới bài (chưa có câu AI nào) được ưu tiên hơn (FR-167). Bình luận không tồn tại → `null`.
 */
export async function countRepliesForCommentThread(
  tx: Database,
  workspaceId: string,
  commentId: string,
  now: Date,
): Promise<number | null> {
  const c = await tx.execute<{ post_id: string; author_external_id: string }>(sql`
    SELECT post_id, author_external_id FROM cf.comments
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid`);
  const row = c.rows[0];
  if (!row) return null;
  return countCustomerPostReplies(
    tx,
    workspaceId,
    row.post_id,
    row.author_external_id,
    now,
    commentId,
  );
}

export async function loadPipelineConvo(tx: Database, a: Anchor): Promise<PipelineConvo> {
  const ws = a.workspaceId;
  // Các lượt khách TRƯỚC trong chuỗi (cùng khách + bài), mới nhất trước; không tính bình luận đã gộp vào chính nó.
  const earlier = await tx.execute<{ id: string; text: string; at: string | Date }>(sql`
    SELECT id, text, coalesce(created_time, created_at) AS at FROM cf.comments
     WHERE workspace_id = ${ws}::uuid AND post_id = ${a.postId}::uuid AND author_external_id = ${a.authorExternalId}
       AND id <> ${a.commentId}::uuid AND is_own = false AND deleted_at IS NULL
       AND coalesce(created_time, created_at) < ${a.createdTime.toISOString()}::timestamptz
       AND (merged_into_id IS NULL OR merged_into_id <> ${a.commentId}::uuid)
     ORDER BY coalesce(created_time, created_at) DESC, id
     LIMIT ${MAX_THREAD_TURNS}`);
  const ids = earlier.rows.map((r) => r.id);
  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const turns: ConvoTurn[] = earlier.rows.map((r) => ({
    from: 'customer',
    text: maskPii(r.text),
    at: asDate(r.at),
  }));
  let stateRaw: unknown = null;
  if (ids.length > 0) {
    const replies = await tx.execute<{ text: string; at: string | Date }>(sql`
      SELECT text, coalesce(sent_at, created_at) AS at FROM cf.comment_replies
       WHERE workspace_id = ${ws}::uuid AND status = 'sent' AND comment_id IN (${idList})`);
    for (const r of replies.rows)
      turns.push({ from: 'shop', text: maskPii(r.text), at: asDate(r.at) });
    // Trạng thái có cấu trúc của lượt GẦN NHẤT trong chuỗi (bản nháp mới nhất của các bình luận trước).
    const latest = await tx.execute<{ context_refs: unknown }>(sql`
      SELECT context_refs FROM cf.drafts
       WHERE workspace_id = ${ws}::uuid AND target_type = 'comment' AND target_id IN (${idList})
         AND action IN ('answer', 'clarify', 'redirect')
       ORDER BY created_at DESC LIMIT 1`);
    const refs = latest.rows[0]?.context_refs;
    if (Array.isArray(refs)) {
      stateRaw = refs.find((x) => (x as { type?: unknown } | null)?.type === 'state') ?? null;
    }
  }
  turns.sort((x, y) => x.at.getTime() - y.at.getTime());

  let parentComment: MaskedText | null = null;
  if (a.parentExternalId) {
    const parent = await tx.execute<{ text: string }>(sql`
      SELECT text FROM cf.comments
       WHERE workspace_id = ${ws}::uuid AND channel_id = ${a.channelId}::uuid AND external_id = ${a.parentExternalId}
         AND deleted_at IS NULL`);
    const text = parent.rows[0]?.text;
    parentComment = text ? maskPii(text) : null;
  }

  const productNames = await tx.execute<{ name: string }>(sql`
    SELECT p.name FROM cf.post_products pp JOIN cf.products p ON p.workspace_id = pp.workspace_id AND p.id = pp.product_id
     WHERE pp.workspace_id = ${ws}::uuid AND pp.post_id = ${a.postId}::uuid AND pp.status = 'confirmed'
     ORDER BY pp.is_primary DESC, p.name`);

  const other = await tx.execute<{ post_id: string; text: string; at: string | Date }>(sql`
    SELECT post_id, text, coalesce(created_time, created_at) AS at FROM cf.comments
     WHERE workspace_id = ${ws}::uuid AND author_external_id = ${a.authorExternalId} AND post_id <> ${a.postId}::uuid
       AND is_own = false AND deleted_at IS NULL AND merged_into_id IS NULL
       AND coalesce(created_time, created_at) <= ${a.now.toISOString()}::timestamptz
       AND coalesce(created_time, created_at) >= ${a.now.toISOString()}::timestamptz - make_interval(days => ${OTHER_POST_WINDOW_DAYS})
     ORDER BY coalesce(created_time, created_at) DESC, id
     LIMIT ${MAX_OTHER_POST_QUESTIONS}`);

  return {
    turns,
    parentComment,
    postCaption: a.postCaption ? maskPii(a.postCaption) : null,
    postProductNames: productNames.rows.map((r) => r.name),
    otherQuestions: other.rows.map((r) => ({
      postId: r.post_id,
      text: maskPii(r.text),
      at: asDate(r.at),
    })),
    stateRaw,
  };
}
