import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';
import { posts } from './posts';

/** Trạng thái bình luận (docs/10 §3.2). */
export const COMMENT_STATUSES = [
  'new',
  'processing',
  'pending_review',
  'needs_human',
  'scheduled_auto',
  'sending',
  'replied',
  'auto_replied',
  'send_failed',
  'skipped',
  'spam_suspected',
  'hidden',
] as const;

/**
 * Bình luận (docs/10 §3.2). Các cột của giai đoạn sau (nhãn, gộp, nghi mạo danh, khóa mềm...) tạo sẵn với mặc định theo
 * spec để khỏi migration lại. Khóa ngoại ghép (workspace_id, …) chặn gắn chéo workspace.
 */
export const comments = cf.table(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    postId: uuid('post_id').notNull(),
    externalId: text('external_id').notNull(),
    parentExternalId: text('parent_external_id'),
    authorExternalId: text('author_external_id').notNull(),
    authorName: text('author_name'),
    text: text('text').notNull(),
    textNormalized: text('text_normalized'),
    lang: text('lang'),
    createdTime: timestamptz('created_time'),
    label: text('label'),
    labelConfidence: numeric('label_confidence', { precision: 4, scale: 3 }),
    labelSource: text('label_source'),
    labels: jsonb('labels').notNull().default(sql`'[]'::jsonb`),
    attachments: jsonb('attachments').notNull().default(sql`'[]'::jsonb`),
    needsFollowup: boolean('needs_followup').notNull().default(false),
    followupTopics: text('followup_topics').array().notNull().default(sql`'{}'::text[]`),
    mergedIntoId: uuid('merged_into_id'),
    isImpersonationSuspected: boolean('is_impersonation_suspected').notNull().default(false),
    status: text('status').notNull().default('new'),
    isHidden: boolean('is_hidden').notNull().default(false),
    isOwn: boolean('is_own').notNull().default(false),
    lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
    lockedUntil: timestamptz('locked_until'),
    externalReplyId: text('external_reply_id'),
    repliedBy: uuid('replied_by').references(() => users.id, { onDelete: 'set null' }),
    repliedAt: timestamptz('replied_at'),
    privateRepliedAt: timestamptz('private_replied_at'),
    /** Khách xóa bình luận trên nền tảng (FR-048): ẩn khỏi inbox, GIỮ dòng + log. Chỉ đường hệ thống ghi (trigger). */
    deletedAt: timestamptz('deleted_at'),
    /** Thời điểm (theo nền tảng) của lần sửa nội dung đã áp dụng gần nhất: lần sửa cũ đến muộn không ghi đè. Chỉ hệ thống ghi. */
    textSyncedAt: timestamptz('text_synced_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'comments_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'comments_post_fk',
      columns: [t.workspaceId, t.channelId, t.postId],
      foreignColumns: [posts.workspaceId, posts.channelId, posts.id],
    }).onDelete('cascade'),
    unique('comments_channel_external_unique').on(t.channelId, t.externalId),
    unique('comments_workspace_id_id_unique').on(t.workspaceId, t.id),
    foreignKey({
      name: 'comments_merged_into_fk',
      columns: [t.workspaceId, t.mergedIntoId],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete('set null'),
    index('comments_workspace_status_created_idx').on(t.workspaceId, t.status, t.createdTime),
    index('comments_post_id_idx').on(t.postId),
    index('comments_merged_into_idx')
      .on(t.workspaceId, t.mergedIntoId)
      .where(sql`${t.mergedIntoId} is not null`),
    check(
      'comments_label_confidence_check',
      sql`${t.labelConfidence} is null or (${t.labelConfidence} >= 0 and ${t.labelConfidence} <= 1)`,
    ),
    check(
      'comments_status_check',
      sql`${t.status} in (${sql.raw(COMMENT_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check(
      'comments_label_source_check',
      sql`${t.labelSource} is null or ${t.labelSource} in ('rule', 'ml', 'llm', 'human')`,
    ),
  ],
);
