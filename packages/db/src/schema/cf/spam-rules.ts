import { sql } from 'drizzle-orm';
import { boolean, check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/**
 * Quy tắc spam theo workspace (FR-080, docs/10 §3.5 `rules`, Q-SRS1). Chỉ lưu — việc CHẠY quy tắc là việc sau.
 * Chỉ Owner (hoặc hệ thống) ghi. Nội dung (tên/loại/mẫu/hành động) bất biến sau INSERT: đổi = xóa + tạo lại.
 * `action` chưa có `auto_hide`: Tự ẩn là việc riêng (AUTO-HIDE); AI/quy tắc không tự ẩn (nguyên tắc #3).
 */
export const rules = cf.table(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    pattern: text('pattern').notNull(),
    action: text('action').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** Chạy thử đến mốc này (chỉ ghi nhận, chưa tác động) — dùng ở việc chạy quy tắc sau. */
    shadowUntil: timestamp('shadow_until', { withTimezone: true }),
    /** Owner tạo (null = hệ thống / người dùng đã bị xóa). Chỉ được là chính người ghi. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('rules_workspace_idx').on(t.workspaceId, t.createdAt),
    check('rules_name_check', sql`char_length(${t.name}) BETWEEN 1 AND 80`),
    check(
      'rules_type_check',
      sql`${t.type} IN ('keyword', 'regex', 'phone', 'link', 'emoji_only', 'tag_only')`,
    ),
    check('rules_action_check', sql`${t.action} IN ('mark', 'skip')`),
    check('rules_pattern_len_check', sql`char_length(${t.pattern}) <= 200`),
    check(
      'rules_pattern_shape_check',
      sql`(${t.type} IN ('keyword', 'regex') AND ${t.pattern} <> '') OR (${t.type} NOT IN ('keyword', 'regex') AND ${t.pattern} = '')`,
    ),
  ],
);
