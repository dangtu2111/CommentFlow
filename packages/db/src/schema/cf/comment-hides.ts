import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';
import { comments } from './comments';

export const HIDE_ACTIONS = ['hide', 'unhide'] as const;
export type HideAction = (typeof HIDE_ACTIONS)[number];

export const HIDE_STATUSES = ['queued', 'sending', 'done', 'failed', 'cancelled'] as const;
export type HideStatus = (typeof HIDE_STATUSES)[number];

/** Trạng thái bình luận mà người dùng được phép ẩn / hoặc dùng làm đích khôi phục khi bỏ ẩn (khớp `cf.request_comment_hide`). */
export const HIDEABLE_STATUSES = [
  'new',
  'pending_review',
  'needs_human',
  'send_failed',
  'skipped',
  'spam_suspected',
  'replied',
  'auto_replied',
] as const;

/**
 * Hàng đợi ẩn/bỏ ẩn bình luận (outbox; ADR 009, FR-044). Một dòng = một yêu cầu "ẩn (hoặc bỏ ẩn) bình luận này trên nền
 * tảng". KHÔNG INSERT trực tiếp bằng `cf_app` — chỉ qua hàm DEFINER `cf.request_comment_hide`. Chỉ đường hệ thống (worker,
 * job `hide`) cập nhật kết quả; `comments.is_hidden`/`status = hidden` chỉ đổi SAU khi nền tảng xác nhận. Unique một yêu
 * cầu ĐANG HOẠT ĐỘNG (`queued`/`sending`) cho mỗi bình luận.
 */
export const commentHides = cf.table(
  'comment_hides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    commentId: uuid('comment_id').notNull(),
    action: text('action').notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    /** Mã lý do lỗi/hủy an toàn (mã `PlatformError`, `recheck:H#`, `connector_unavailable`...) — không chứa nội dung. */
    errorCode: text('error_code'),
    /** `hide`: trạng thái bình luận trước khi ẩn. `unhide`: trạng thái sẽ khôi phục khi bỏ ẩn xong. */
    previousStatus: text('previous_status').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    doneAt: timestamptz('done_at'),
  },
  (t) => [
    foreignKey({
      name: 'comment_hides_comment_fk',
      columns: [t.workspaceId, t.commentId],
      foreignColumns: [comments.workspaceId, comments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'comment_hides_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }).onDelete('cascade'),
    uniqueIndex('comment_hides_one_active_per_comment')
      .on(t.workspaceId, t.commentId)
      .where(sql`${t.status} in ('queued', 'sending')`),
    index('comment_hides_workspace_comment_idx').on(t.workspaceId, t.commentId),
    index('comment_hides_workspace_channel_idx').on(t.workspaceId, t.channelId),
    check(
      'comment_hides_action_check',
      sql`${t.action} in (${sql.raw(HIDE_ACTIONS.map((a) => `'${a}'`).join(', '))})`,
    ),
    check(
      'comment_hides_status_check',
      sql`${t.status} in (${sql.raw(HIDE_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check(
      'comment_hides_previous_status_check',
      sql`${t.previousStatus} in (${sql.raw(HIDEABLE_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check('comment_hides_attempts_check', sql`${t.attempts} >= 0`),
  ],
);
