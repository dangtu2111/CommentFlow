import { sql } from 'drizzle-orm';
import { check, foreignKey, index, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { posts } from './posts';

/**
 * Ghi chú riêng của bài có ngày hiệu lực (FR-062, US-033, docs/10 `post_notes`). Hết hạn (`valid_to`, loại trừ)
 * thì không còn được dùng khi trả lời. Owner (hoặc hệ thống) ghi; Staff chỉ đọc.
 */
export const postNotes = cf.table(
  'post_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').notNull(),
    content: text('content').notNull(),
    validFrom: timestamptz('valid_from').notNull().defaultNow(),
    validTo: timestamptz('valid_to'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'post_notes_post_fk',
      columns: [t.workspaceId, t.postId],
      foreignColumns: [posts.workspaceId, posts.id],
    }).onDelete('cascade'),
    index('post_notes_post_idx').on(t.workspaceId, t.postId, t.validTo),
    check('post_notes_content_check', sql`char_length(${t.content}) between 1 and 1000`),
    check('post_notes_range_check', sql`${t.validTo} IS NULL OR ${t.validTo} > ${t.validFrom}`),
  ],
);

/**
 * Ghi đè chế độ tự động theo bài (FR-062). Không có dòng = theo chế độ nền. CHỈ siết: `off` hoặc `shadow`
 * (CHECK) — không bao giờ bật `auto` (Q-PN1, nguyên tắc 3). Owner (hoặc hệ thống) ghi.
 */
export const postAutoOverrides = cf.table(
  'post_auto_overrides',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').notNull(),
    mode: text('mode').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'post_auto_overrides_pk', columns: [t.workspaceId, t.postId] }),
    foreignKey({
      name: 'post_auto_overrides_post_fk',
      columns: [t.workspaceId, t.postId],
      foreignColumns: [posts.workspaceId, posts.id],
    }).onDelete('cascade'),
    check('post_auto_overrides_mode_check', sql`${t.mode} IN ('off', 'shadow')`),
  ],
);
