import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

export const DRAFT_TARGET_TYPES = ['comment', 'message'] as const;
export const DRAFT_STATUSES = [
  'suggested',
  'sent_as_is',
  'edited',
  'discarded',
  'auto_sent',
  'would_send',
] as const;
export const DRAFT_ACTIONS = ['answer', 'clarify', 'redirect', 'handoff'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Bản nháp trả lời do AI soạn (FR-029, docs/10 `drafts`; Q-PS1). Hệ thống (pipeline) ghi MỘT lần lúc soạn; sau đó
 * người dùng chỉ đổi cột xử lý (trạng thái, câu gửi thật, khoảng cách sửa, biến thể chọn). `price_snapshot`
 * (FR-111) chụp giá/tồn lúc soạn — BẤT BIẾN sau khi tạo để `sendRecheck` R5 không bị qua mặt.
 * `target_id` trỏ bình luận hoặc tin nhắn (đa hình → không khóa ngoại).
 */
export const drafts = cf.table(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    text: text('text').notNull(),
    lang: text('lang').notNull(),
    sources: jsonb('sources').notNull().default(sql`'[]'::jsonb`),
    confidence: doublePrecision('confidence'),
    needsHuman: boolean('needs_human').notNull().default(false),
    reason: text('reason'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    kbVersion: integer('kb_version'),
    status: text('status').notNull().default('suggested'),
    notAutoSentReason: text('not_auto_sent_reason'),
    failedGate: text('failed_gate'),
    finalText: text('final_text'),
    editDistance: integer('edit_distance'),
    traceId: text('trace_id'),
    action: text('action').notNull().default('answer'),
    variants: jsonb('variants').notNull().default(sql`'[]'::jsonb`),
    chosenVariant: smallint('chosen_variant'),
    confidenceComponents: jsonb('confidence_components'),
    extracted: jsonb('extracted'),
    claims: jsonb('claims').notNull().default(sql`'[]'::jsonb`),
    unansweredTopics: text('unanswered_topics').array().notNull().default(sql`'{}'::text[]`),
    contextRefs: jsonb('context_refs').notNull().default(sql`'[]'::jsonb`),
    /** `[{product_id, variant_id, price_vnd, stock, updated_from_source_at}]` lúc soạn (FR-111). */
    priceSnapshot: jsonb('price_snapshot').notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('drafts_target_idx').on(t.workspaceId, t.targetType, t.targetId, t.createdAt),
    index('drafts_workspace_status_idx').on(t.workspaceId, t.status, t.createdAt),
    check('drafts_target_type_check', sql`${t.targetType} in (${list(DRAFT_TARGET_TYPES)})`),
    check('drafts_status_check', sql`${t.status} in (${list(DRAFT_STATUSES)})`),
    check('drafts_action_check', sql`${t.action} in (${list(DRAFT_ACTIONS)})`),
    check('drafts_lang_check', sql`${t.lang} in ('vi', 'en')`),
    check(
      'drafts_confidence_check',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
    check('drafts_edit_distance_check', sql`${t.editDistance} IS NULL OR ${t.editDistance} >= 0`),
    check(
      'drafts_chosen_variant_check',
      sql`${t.chosenVariant} IS NULL OR ${t.chosenVariant} >= 0`,
    ),
    check('drafts_price_snapshot_check', sql`jsonb_typeof(${t.priceSnapshot}) = 'array'`),
  ],
);
