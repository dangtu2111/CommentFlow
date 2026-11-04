import { boolean, foreignKey, integer, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';

/** Bài viết của kênh (docs/10 §3.2). Khóa ngoại ghép (workspace_id, channel_id) → channels: không gắn chéo workspace. */
export const posts = cf.table(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    externalId: text('external_id').notNull(),
    message: text('message'),
    permalink: text('permalink'),
    mediaUrl: text('media_url'),
    isAd: boolean('is_ad').notNull().default(false),
    createdTime: timestamptz('created_time'),
    commentCount: integer('comment_count').notNull().default(0),
    pendingCount: integer('pending_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'posts_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }).onDelete('cascade'),
    unique('posts_channel_external_unique').on(t.channelId, t.externalId),
    unique('posts_workspace_id_id_unique').on(t.workspaceId, t.id),
    // Đích của khóa ngoại ghép (workspace_id, channel_id, post_id) từ comments: bình luận phải thuộc ĐÚNG kênh của bài.
    unique('posts_workspace_channel_id_unique').on(t.workspaceId, t.channelId, t.id),
  ],
);
