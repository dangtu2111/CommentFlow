import {
  boolean,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from '../core';

/** Schema riêng của CommentFlow (docs/10 §1). Bảng core không có khóa ngoại trỏ sang đây. */
export const cf = pgSchema('cf');

/**
 * Mỗi lần gọi LLM ghi một dòng (nguyên tắc bất biến #7). Chỉ thêm, không sửa/xóa.
 * `prompt_version` có trong nguyên tắc #7 nhưng chưa có trong cột liệt kê ở docs/10 §3.3 — đã thêm.
 */
export const aiUsage = cf.table(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Chưa có khóa ngoại: bảng `drafts` làm ở giai đoạn sau. */
    draftId: uuid('draft_id'),
    step: text('step').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    cacheHit: boolean('cache_hit').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_workspace_created_idx').on(t.workspaceId, t.createdAt)],
);
