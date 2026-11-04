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
           p.is_ad, c.locked_by, c.locked_until, (c.locked_until > now()) AS lock_active, u.name AS holder_name
      FROM cf.comments c
      JOIN cf.channels ch ON ch.workspace_id = c.workspace_id AND ch.id = c.channel_id
      JOIN cf.posts p ON p.workspace_id = c.workspace_id AND p.id = c.post_id
      LEFT JOIN core.users u ON u.id = c.locked_by
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
