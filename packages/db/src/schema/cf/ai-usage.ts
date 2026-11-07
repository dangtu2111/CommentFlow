import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from '../core';

/** Schema riêng của CommentFlow (docs/10 §1). Bảng core không có khóa ngoại trỏ sang đây. */
export const cf = pgSchema('cf');

/**
 * Mỗi lần gọi LLM ghi một dòng (nguyên tắc bất biến #7). Chỉ thêm; chỉ hàm DEFINER `cf.compact_ai_usage` được xóa dòng cũ > 90 ngày (gộp vào `aiUsageDaily`).
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
    /** Token suy luận (đã nằm trong `outputTokens`); để kiểm `reasoning_effort` thấp nhất cho ≈ 0 (migration 0069). */
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    cacheHit: boolean('cache_hit').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_workspace_created_idx').on(t.workspaceId, t.createdAt)],
);

/**
 * Bản gộp theo ngày của `ai_usage` cũ hơn 90 ngày (FR-126, migration 0053). Chỉ hàm DEFINER
 * `cf.compact_ai_usage` ghi (job retention của worker); thành viên chỉ đọc. Không chứa nội dung khách.
 */
export const aiUsageDaily = cf.table(
  'ai_usage_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    step: text('step').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull().default(''),
    cacheHit: boolean('cache_hit').notNull(),
    calls: integer('calls').notNull(),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull(),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull(),
    cachedTokens: bigint('cached_tokens', { mode: 'number' }).notNull(),
    costUsd: numeric('cost_usd', { precision: 14, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ai_usage_daily_key_unique').on(
      t.workspaceId,
      t.day,
      t.step,
      t.model,
      t.promptVersion,
      t.cacheHit,
    ),
  ],
);
