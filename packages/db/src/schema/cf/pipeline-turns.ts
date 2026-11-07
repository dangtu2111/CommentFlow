import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { comments } from './comments';

export const PIPELINE_TURN_STATES = ['processing', 'done', 'blocked', 'failed'] as const;
export type PipelineTurnState = (typeof PIPELINE_TURN_STATES)[number];

/**
 * Khóa DUY NHẤT theo bình luận cho một lượt xử lý AI (PIPE-ORCHESTRATOR lát C, Q-POR3; migration 0073): `comment_id` là khóa chính nên
 * mỗi bình luận chỉ có MỘT dòng; `charged_at` ghi một lần (trigger) → trừ lượt idempotent; `attempts` đếm lần giành quyền xử lý. Thành
 * viên workspace chỉ ĐỌC; chỉ hệ thống (worker, `withJob`) ghi.
 */
export const pipelineTurns = cf.table(
  'pipeline_turns',
  {
    commentId: uuid('comment_id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Thời điểm đã trừ lượt AI; `null` = chưa trừ. Ghi MỘT lần. */
    chargedAt: timestamptz('charged_at'),
    attempts: integer('attempts').notNull().default(1),
    state: text('state').notNull().default('processing'),
    /** Mã lý do chặn/lỗi (không chứa nội dung khách). */
    lastError: text('last_error'),
    /** "Thuê" ngắn khi một job đang xử lý: job trùng thấy còn thuê → busy (không tăng `attempts`, không gọi LLM trùng). */
    lockedUntil: timestamptz('locked_until'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'pipeline_turns_comment_fk',
      columns: [t.workspaceId, t.commentId],
      foreignColumns: [comments.workspaceId, comments.id],
    }).onDelete('cascade'),
    index('pipeline_turns_workspace_state_idx').on(t.workspaceId, t.state, t.updatedAt),
    check('pipeline_turns_attempts_check', sql`${t.attempts} >= 1`),
    check(
      'pipeline_turns_state_check',
      sql`${t.state} IN (${sql.raw(PIPELINE_TURN_STATES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check(
      'pipeline_turns_error_check',
      sql`${t.lastError} IS NULL OR char_length(${t.lastError}) <= 200`,
    ),
  ],
);
