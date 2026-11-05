import { foreignKey, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';

/**
 * Dấu xóa (FR-048, migration 0026): sự kiện "khách xóa" đến TRƯỚC sự kiện "tạo" → ghi (kênh, mã bình luận, giờ xóa) để lúc
 * dòng bình luận được tạo, trigger lưu nó NGAY ở dạng đã xóa trắng. Chỉ chứa mã, không có nội dung/tên khách.
 * Chỉ hàm DEFINER `cf.mark_comment_deleted` ghi; cf_app không có quyền trực tiếp. Job dọn xóa dấu cũ hơn 14 ngày.
 */
export const commentTombstones = cf.table(
  'comment_tombstones',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    externalId: text('external_id').notNull(),
    deletedAt: timestamptz('deleted_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'comment_tombstones_pk', columns: [t.channelId, t.externalId] }),
    foreignKey({
      name: 'comment_tombstones_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }).onDelete('cascade'),
  ],
);
