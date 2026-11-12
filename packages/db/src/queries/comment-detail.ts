import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import type { InboxPlatform } from './inbox';

/**
 * Chi tiết một bình luận (cột phải trang Bình luận). CHỈ ĐỌC, dữ liệu thật: bài chỉ có mã ngoài + cờ quảng cáo (nội
 * dung bài/sản phẩm gắn/gợi ý AI chưa có — gap). Gọi trong `withActor`; id workspace khác/người ngoài → `null`.
 */
export type CommentDetail = {
  id: string;
  status: string;
  text: string;
  authorName: string | null;
  /** URL ảnh đại diện người bình luận (https, từ nền tảng); `null` = chưa có/nền tảng không trả. */
  authorAvatarUrl: string | null;
  authorExternalId: string;
  createdTime: Date | null;
  label: string | null;
  needsFollowup: boolean;
  parentExternalId: string | null;
  channelId: string;
  channelName: string;
  platform: InboxPlatform;
  postExternalId: string;
  isAd: boolean;
  /** Trạng thái kênh (`connected` mới gửi được). */
  channelStatus: string;
  /** Khách đã xóa bình luận trên nền tảng (FR-048); `null` nếu còn. */
  deletedAt: Date | null;
  /** Đã ẩn trên nền tảng (chỉ worker ghi, SAU khi nền tảng xác nhận — ADR 009). */
  isHidden: boolean;
  /** Yêu cầu ẩn/bỏ ẩn MỚI NHẤT của bình luận (hàng đợi ẩn, ADR 009); `null` nếu chưa có. */
  latestHide: {
    id: string;
    action: 'hide' | 'unhide';
    status: string;
    errorCode: string | null;
  } | null;
  /** Yêu cầu trả lời MỚI NHẤT của bình luận (hàng đợi gửi, ADR 008); `null` nếu chưa có. */
  latestReply: {
    id: string;
    status: string;
    text: string;
    errorCode: string | null;
    sentAt: Date | null;
  } | null;
  /** Người đang giữ khóa còn hạn (kể cả chính mình); `null` nếu không ai giữ hoặc đã hết hạn. */
  lock: { holderId: string; holderName: string | null; until: Date; heldByMe: boolean } | null;
  /**
   * Câu gợi ý AI MỚI NHẤT của bình luận (FR-043, PIPE-ORCHESTRATOR lát F). Bản cũ giữ làm lịch sử, chi tiết chỉ hiện bản mới nhất
   * (Q-POR11); `null` nếu chưa có hoặc bản mới nhất là "Cần nhân viên" (chỗ giữ chỗ, xem `aiDraft`). Văn bản đã che PII khi AI soạn.
   */
  suggestion: {
    text: string;
    sourceIds: string[];
    /** id nguồn → tên (sản phẩm / đoạn kiến thức); nguồn không tra được thì không có khóa. */
    sourceTitles: Record<string, string>;
    needsHuman: boolean;
  } | null;
  /** Thông tin bản nháp mới nhất để giải thích với nhân viên ("gợi ý — chưa gửi", lý do cần nhân viên). */
  aiDraft: { action: string; reason: string | null; createdAt: Date } | null;
  /** Trạng thái khóa lượt của pipeline (`processing`/`done`/`blocked`/`failed`); `null` nếu bình luận chưa từng vào pipeline. */
  aiTurnState: string | null;
};

type Row = {
  id: string;
  status: string;
  text: string;
  author_name: string | null;
  author_avatar_url: string | null;
  author_external_id: string;
  created_time: Date | null;
  label: string | null;
  needs_followup: boolean;
  parent_external_id: string | null;
  channel_id: string;
  channel_name: string;
  platform: InboxPlatform;
  post_external_id: string;
  is_ad: boolean;
  channel_status: string;
  deleted_at: Date | null;
  is_hidden: boolean;
  hide_id: string | null;
  hide_action: 'hide' | 'unhide' | null;
  hide_status: string | null;
  hide_error_code: string | null;
  reply_id: string | null;
  reply_status: string | null;
  reply_text: string | null;
  reply_error_code: string | null;
  reply_sent_at: Date | null;
  locked_by: string | null;
  locked_until: Date | null;
  lock_active: boolean | null;
  holder_name: string | null;
  draft_text: string | null;
  draft_sources: unknown;
  draft_needs_human: boolean | null;
  draft_action: string | null;
  draft_reason: string | null;
  draft_created_at: Date | null;
  turn_state: string | null;
};

export async function getCommentDetail(
  tx: Database,
  workspaceId: string,
  commentId: string,
  viewerId: string,
): Promise<CommentDetail | null> {
  const result = await tx.execute<Row>(sql`
    SELECT c.id, c.status, c.text, c.author_name, c.author_avatar_url, c.author_external_id, c.created_time, c.label, c.needs_followup,
           c.parent_external_id, c.channel_id, ch.name AS channel_name, ch.platform, p.external_id AS post_external_id,
           p.is_ad, ch.status AS channel_status, c.deleted_at, c.is_hidden,
           lh.id AS hide_id, lh.action AS hide_action, lh.status AS hide_status, lh.error_code AS hide_error_code,
           lr.id AS reply_id, lr.status AS reply_status, lr.text AS reply_text,
           lr.error_code AS reply_error_code, lr.sent_at AS reply_sent_at,
           c.locked_by, c.locked_until, (c.locked_until > now()) AS lock_active, u.name AS holder_name,
           ld.text AS draft_text, ld.sources AS draft_sources, ld.needs_human AS draft_needs_human, ld.action AS draft_action,
           ld.reason AS draft_reason, ld.created_at AS draft_created_at, pt.state AS turn_state
      FROM cf.comments c
      JOIN cf.channels ch ON ch.workspace_id = c.workspace_id AND ch.id = c.channel_id
      JOIN cf.posts p ON p.workspace_id = c.workspace_id AND p.id = c.post_id
      LEFT JOIN core.users u ON u.id = c.locked_by
      LEFT JOIN LATERAL (
        SELECT r.id, r.status, r.text, r.error_code, r.sent_at
          FROM cf.comment_replies r
         WHERE r.workspace_id = c.workspace_id AND r.comment_id = c.id
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 1
      ) lr ON true
      LEFT JOIN LATERAL (
        SELECT d.text, d.sources, d.needs_human, d.action, d.reason, d.created_at
          FROM cf.drafts d
         WHERE d.workspace_id = c.workspace_id AND d.target_type = 'comment' AND d.target_id = c.id
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT 1
      ) ld ON true
      LEFT JOIN cf.pipeline_turns pt ON pt.workspace_id = c.workspace_id AND pt.comment_id = c.id
      LEFT JOIN LATERAL (
        SELECT h.id, h.action, h.status, h.error_code
          FROM cf.comment_hides h
         WHERE h.workspace_id = c.workspace_id AND h.comment_id = c.id
         ORDER BY h.created_at DESC, h.id DESC
         LIMIT 1
      ) lh ON true
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.id = ${commentId}::uuid`);
  const row = result.rows[0];
  if (!row) return null;
  const sourceIds = Array.isArray(row.draft_sources)
    ? row.draft_sources.filter((x): x is string => typeof x === 'string')
    : [];
  const sourceTitles = sourceIds.length > 0 ? await sourceTitlesOf(tx, workspaceId, sourceIds) : {};
  return {
    // Bản "Cần nhân viên" (action `handoff`) chỉ là chỗ giữ chỗ, KHÔNG phải câu gợi ý: không đưa vào ô soạn; lý do hiện qua `aiDraft`.
    suggestion:
      row.draft_text === null || row.draft_action === 'handoff'
        ? null
        : {
            text: row.draft_text,
            sourceIds,
            sourceTitles,
            needsHuman: row.draft_needs_human === true,
          },
    aiDraft:
      row.draft_text === null || row.draft_action === null || row.draft_created_at === null
        ? null
        : {
            action: row.draft_action,
            reason: row.draft_reason,
            createdAt: new Date(row.draft_created_at),
          },
    aiTurnState: row.turn_state,
    id: row.id,
    status: row.status,
    text: row.text,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    authorExternalId: row.author_external_id,
    createdTime: row.created_time,
    label: row.label,
    needsFollowup: row.needs_followup,
    parentExternalId: row.parent_external_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    platform: row.platform,
    postExternalId: row.post_external_id,
    isAd: row.is_ad,
    channelStatus: row.channel_status,
    deletedAt: row.deleted_at,
    isHidden: row.is_hidden,
    latestHide:
      row.hide_id && row.hide_action && row.hide_status
        ? {
            id: row.hide_id,
            action: row.hide_action,
            status: row.hide_status,
            errorCode: row.hide_error_code,
          }
        : null,
    latestReply:
      row.reply_id && row.reply_status && row.reply_text !== null
        ? {
            id: row.reply_id,
            status: row.reply_status,
            text: row.reply_text,
            errorCode: row.reply_error_code,
            sentAt: row.reply_sent_at,
          }
        : null,
    lock:
      row.locked_by && row.locked_until && row.lock_active
        ? {
            holderId: row.locked_by,
            holderName: row.holder_name,
            until: new Date(row.locked_until),
            heldByMe: row.locked_by === viewerId,
          }
        : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tên hiển thị của nguồn bản nháp: sản phẩm (id uuid) hoặc đoạn kiến thức (`kb:<uuid>`; tiêu đề ngữ cảnh hoặc mã đoạn). Nguồn không tra được
 * (chính sách/FAQ mẫu, id lạ) → bỏ qua, giao diện dùng nhãn chung. Chỉ đọc, lọc `workspace_id`.
 */
async function sourceTitlesOf(
  tx: Database,
  workspaceId: string,
  sourceIds: readonly string[],
): Promise<Record<string, string>> {
  const raw = (id: string): string => id.replace(/^kb:/, '');
  const ids = [...new Set(sourceIds.map(raw).filter((id) => UUID.test(id)))];
  if (ids.length === 0) return {};
  const list = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const [products, chunks] = await Promise.all([
    tx.execute<{ id: string; title: string }>(
      sql`SELECT id, name AS title FROM cf.products WHERE workspace_id = ${workspaceId}::uuid AND id IN (${list})`,
    ),
    tx.execute<{ id: string; title: string }>(
      sql`SELECT id, coalesce(context_header, chunk_key) AS title FROM cf.kb_chunks WHERE workspace_id = ${workspaceId}::uuid AND id IN (${list})`,
    ),
  ]);
  const byRaw = new Map<string, string>();
  for (const r of [...products.rows, ...chunks.rows]) byRaw.set(r.id, r.title);
  return Object.fromEntries(
    sourceIds.flatMap((id) => {
      const title = byRaw.get(raw(id));
      return title === undefined ? [] : [[id, title]];
    }),
  );
}
