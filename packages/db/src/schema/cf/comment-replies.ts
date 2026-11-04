import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';
import { comments } from './comments';

export const REPLY_STATUSES = ['queued', 'sending', 'sent', 'failed', 'cancelled'] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

/**
 * Hàng đợi gửi trả lời bình luận (outbox; ADR 008). Một dòng = một yêu cầu "gửi câu này cho bình luận này".
 * KHÔNG INSERT trực tiếp bằng `cf_app` — chỉ qua hàm DEFINER `cf.request_comment_reply` (kiểm đúng trạng thái, khóa,
 * kênh). Chỉ đường hệ thống (worker, job `send`) cập nhật kết quả. Nội dung gửi nằm ở đây (không ở `comments`).
 * Unique một yêu cầu ĐANG HOẠT ĐỘNG (`queued`/`sending`) cho mỗi bình luận: chống gửi trùng.
 */
export const commentReplies = cf.table(
  'comment_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    commentId: uuid('comment_id').notNull(),
    text: text('text').notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    externalReplyId: text('external_reply_id'),
    /** Mã lý do lỗi/hủy an toàn (mã `PlatformError`, `recheck:R#`, `connector_unavailable`...) — không chứa nội dung. */
    errorCode: text('error_code'),
    /** Trạng thái bình luận trước khi yêu cầu (để hoàn lại khi hủy). */
    previousStatus: text('previous_status').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    sentAt: timestamptz('sent_at'),
  },
  (t) => [
    foreignKey({
      name: 'comment_replies_comment_fk',
      columns: [t.workspaceId, t.commentId],
      foreignColumns: [comments.workspaceId, comments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'comment_replies_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }).onDelete('cascade'),
    uniqueIndex('comment_replies_one_active_per_comment')
      .on(t.workspaceId, t.commentId)
      .where(sql`${t.status} in ('queued', 'sending')`),
    index('comment_replies_workspace_comment_idx').on(t.workspaceId, t.commentId),
    check(
      'comment_replies_status_check',
      sql`${t.status} in (${sql.raw(REPLY_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check('comment_replies_text_check', sql`char_length(${t.text}) between 1 and 8000`),
  ],
);
