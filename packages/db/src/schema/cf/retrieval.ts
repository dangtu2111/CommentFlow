import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { kbSources } from './kb';
import { products } from './products';

/** Chủ đề/trạng thái/nhánh: khớp `KB_GAP_TOPICS`/`KB_GAP_STATUSES`/`RETRIEVAL_ROUTES` ở `@flow/shared` (test kiểm khớp). */
export const KB_GAP_TOPIC_VALUES = [
  'shipping',
  'discount',
  'product_info',
  'policy',
  'order_status',
  'size',
  'other',
] as const;
/** Mã chủ đề mịn của sự kiện (khớp `FactTopic` ở `@flow/ai`). */
export const KB_GAP_FACT_TOPIC_VALUES = [
  'price',
  'stock',
  'ship_fee',
  'ship_time',
  'cod',
  'returns',
  'warranty',
  'payment',
  'ship_destination',
  'refund_to',
  'return_shipping',
  'return_eligibility',
  'defect',
] as const;
export const KB_GAP_STATUS_VALUES = ['open', 'resolved', 'ignored'] as const;
export const RETRIEVAL_ROUTE_VALUES = ['sql', 'hybrid', 'both'] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Nhật ký tìm kiếm (FR-134, `docs/10`): mỗi lần AI tìm kiến thức ghi ứng viên + điểm từng nhánh + đoạn đã dùng + sản phẩm
 * đã nhận. Chỉ thêm (INSERT từ job hệ thống), lưu 90 ngày; mọi chuỗi đã qua `maskPii`. `draft_id`/`comment_id` chưa có
 * khóa ngoại (bảng `drafts` làm sau; nhật ký không được chặn việc xóa bình luận).
 */
export const retrievalLogs = cf.table(
  'retrieval_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id'),
    commentId: uuid('comment_id'),
    queryMasked: text('query_masked').notNull(),
    lang: text('lang').notNull(),
    kbVersion: integer('kb_version'),
    route: text('route').notNull(),
    searchQueryMasked: text('search_query_masked'),
    candidates: jsonb('candidates').notNull().default(sql`'[]'::jsonb`),
    usedChunkIds: uuid('used_chunk_ids').array().notNull().default(sql`'{}'::uuid[]`),
    resolvedProductIds: uuid('resolved_product_ids').array().notNull().default(sql`'{}'::uuid[]`),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('retrieval_logs_workspace_draft_idx').on(t.workspaceId, t.draftId),
    index('retrieval_logs_created_idx').on(t.createdAt),
    check('retrieval_logs_lang_check', sql`${t.lang} IN ('vi', 'en')`),
    check('retrieval_logs_route_check', sql`${t.route} IN (${inList(RETRIEVAL_ROUTE_VALUES)})`),
    check('retrieval_logs_latency_check', sql`${t.latencyMs} >= 0`),
    check('retrieval_logs_kb_version_check', sql`${t.kbVersion} IS NULL OR ${t.kbVersion} >= 1`),
    check(
      'retrieval_logs_candidates_check',
      sql`jsonb_typeof(${t.candidates}) = 'array' AND jsonb_array_length(${t.candidates}) <= 50`,
    ),
    check('retrieval_logs_used_chunks_check', sql`cardinality(${t.usedChunkIds}) <= 20`),
    check('retrieval_logs_products_check', sql`cardinality(${t.resolvedProductIds}) <= 20`),
    check(
      'retrieval_logs_text_check',
      sql`char_length(${t.queryMasked}) BETWEEN 1 AND 500 AND (${t.searchQueryMasked} IS NULL OR char_length(${t.searchQueryMasked}) <= 500)`,
    ),
  ],
);

/**
 * "Câu hỏi AI chưa trả lời được" (FR-134/141): gộp theo (workspace, chủ đề, sản phẩm). Đếm do job hệ thống ghi
 * (`recordKbGap`), thành viên chỉ đổi `status`/`resolved_by_source_id`.
 */
export const kbGaps = cf.table(
  'kb_gaps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    sampleQuestionMasked: text('sample_question_masked').notNull(),
    productId: uuid('product_id'),
    /** KB-DISTILL (0084): chủ đề MỊN của sự kiện (mã `FactTopic`); null = chưa rõ hoặc gap gộp nhiều chủ đề → không tự đóng khi duyệt thẻ. */
    factTopic: text('fact_topic'),
    count: integer('count').notNull().default(1),
    firstSeenAt: timestamptz('first_seen_at').notNull().defaultNow(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    status: text('status').notNull().default('open'),
    resolvedBySourceId: uuid('resolved_by_source_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'kb_gaps_product_fk',
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }),
    foreignKey({
      name: 'kb_gaps_source_fk',
      columns: [t.workspaceId, t.resolvedBySourceId],
      foreignColumns: [kbSources.workspaceId, kbSources.id],
    }),
    uniqueIndex('kb_gaps_key_unique').on(
      t.workspaceId,
      t.topic,
      sql`coalesce(${t.productId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index('kb_gaps_workspace_status_idx').on(t.workspaceId, t.status, t.lastSeenAt),
    check('kb_gaps_topic_check', sql`${t.topic} IN (${inList(KB_GAP_TOPIC_VALUES)})`),
    check('kb_gaps_status_check', sql`${t.status} IN (${inList(KB_GAP_STATUS_VALUES)})`),
    check(
      'kb_gaps_fact_topic_check',
      sql`${t.factTopic} IS NULL OR ${t.factTopic} IN (${inList(KB_GAP_FACT_TOPIC_VALUES)})`,
    ),
    check('kb_gaps_count_check', sql`${t.count} >= 1`),
    check('kb_gaps_text_check', sql`char_length(${t.sampleQuestionMasked}) BETWEEN 1 AND 500`),
    check(
      'kb_gaps_resolved_source_check',
      sql`${t.status} = 'resolved' OR ${t.resolvedBySourceId} IS NULL`,
    ),
  ],
);
