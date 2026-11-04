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
};

type Row = {
  id: string;
  status: string;
  text: string;
  author_name: string | null;
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
  reply_id: string | null;
  reply_status: string | null;
  reply_text: string | null;
  reply_error_code: string | null;
  reply_sent_at: Date | null;
  locked_by: string | null;
  locked_until: Date | null;
  lock_active: boolean | null;
  holder_name: string | null;
};

export async function getCommentDetail(
  tx: Database,
  workspaceId: string,
  commentId: string,
  viewerId: string,
): Promise<CommentDetail | null> {
  const result = await tx.execute<Row>(sql`
    SELECT c.id, c.status, c.text, c.author_name, c.author_external_id, c.created_time, c.label, c.needs_followup,
           c.parent_external_id, c.channel_id, ch.name AS channel_name, ch.platform, p.external_id AS post_external_id,
           p.is_ad, ch.status AS channel_status,
           lr.id AS reply_id, lr.status AS reply_status, lr.text AS reply_text,
           lr.error_code AS reply_error_code, lr.sent_at AS reply_sent_at,
           c.locked_by, c.locked_until, (c.locked_until > now()) AS lock_active, u.name AS holder_name
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
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.id = ${commentId}::uuid`);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    text: row.text,
    authorName: row.author_name,
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
