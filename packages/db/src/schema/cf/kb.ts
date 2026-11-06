import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/** `halfvec(1024)` của pgvector ≥ 0.7 (FR-139). Giá trị đi qua dạng chữ `[0.1,0.2,…]`. */
export const halfvec1024 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'halfvec(1024)';
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value) {
    return value.slice(1, -1).split(',').map(Number);
  },
});

/** `tsvector` cho tìm kiếm toàn văn; trigger `kb_chunks_fill_search` điền theo `lang` (0037, docs/10 §3.4). */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const KB_SOURCE_TYPES = ['manual', 'faq', 'excel', 'shopify', 'url', 'policy'] as const;
export const KB_SOURCE_STATUSES = ['active', 'syncing', 'error'] as const;
export const KB_CHUNK_LANGS = ['vi', 'en'] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** Nguồn kiến thức của workspace (FR-050). Xóa mềm bằng `deleted_at`. */
export const kbSources = cf.table(
  'kb_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    originUrl: text('origin_url'),
    externalKey: text('external_key'),
    status: text('status').notNull().default('active'),
    lastSyncedAt: timestamptz('last_synced_at'),
    syncError: text('sync_error'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('kb_sources_workspace_id_id_unique').on(t.workspaceId, t.id),
    uniqueIndex('kb_sources_external_key_unique')
      .on(t.workspaceId, t.type, t.externalKey)
      .where(sql`${t.externalKey} is not null and ${t.deletedAt} is null`),
    check('kb_sources_type_check', sql`${t.type} in (${inList(KB_SOURCE_TYPES)})`),
    check('kb_sources_status_check', sql`${t.status} in (${inList(KB_SOURCE_STATUSES)})`),
  ],
);

/** Phiên bản kiến thức đã xuất bản (FR-055, US-035). Bất biến: chỉ INSERT. */
export const kbVersions = cf.table(
  'kb_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamptz('published_at').notNull().defaultNow(),
    note: text('note'),
    changedCategories: text('changed_categories').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    unique('kb_versions_workspace_number_unique').on(t.workspaceId, t.number),
    unique('kb_versions_workspace_id_id_unique').on(t.workspaceId, t.id),
    check('kb_versions_number_check', sql`${t.number} >= 1`),
  ],
);

/**
 * Đoạn kiến thức đã cắt + embedding (FR-055, FR-130, FR-131, FR-133, FR-139). Chỉ worker (hệ thống) ghi.
 * `version_id` rỗng khi là bản nháp. `product_id` chưa có khóa ngoại: bảng `products` do PRODUCTS-VARIANTS tạo.
 * HNSW cho `embedding` và chỉ mục `embedding_model` thuộc KB-EMBED-COL.
 */
export const kbChunks = cf.table(
  'kb_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull(),
    versionId: uuid('version_id'),
    chunkKey: text('chunk_key').notNull(),
    injectionSuspected: boolean('injection_suspected').notNull().default(false),
    injectionReason: text('injection_reason'),
    content: text('content').notNull(),
    lang: text('lang').notNull(),
    contentHash: text('content_hash').notNull(),
    embedding: halfvec1024('embedding'),
    tsv: tsvector('tsv'),
    /** Chữ thường + bỏ dấu của `context_header` + `content`; do trigger `kb_chunks_fill_search` điền (0037). */
    searchNorm: text('search_norm').notNull().default(''),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    isDraft: boolean('is_draft').notNull().default(true),
    contextHeader: text('context_header'),
    productId: uuid('product_id'),
    validFrom: timestamptz('valid_from'),
    validUntil: timestamptz('valid_until'),
    embeddingModel: text('embedding_model'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'kb_chunks_source_fk',
      columns: [t.workspaceId, t.sourceId],
      foreignColumns: [kbSources.workspaceId, kbSources.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'kb_chunks_version_fk',
      columns: [t.workspaceId, t.versionId],
      foreignColumns: [kbVersions.workspaceId, kbVersions.id],
    }),
    unique('kb_chunks_key_unique')
      .on(t.workspaceId, t.sourceId, t.versionId, t.chunkKey)
      .nullsNotDistinct(),
    index('kb_chunks_workspace_version_idx').on(t.workspaceId, t.versionId),
    index('kb_chunks_tsv_idx').using('gin', t.tsv),
    index('kb_chunks_search_norm_trgm_idx').using('gin', t.searchNorm.op('gin_trgm_ops')),
    index('kb_chunks_workspace_product_idx')
      .on(t.workspaceId, t.productId)
      .where(sql`${t.productId} is not null`),
    check('kb_chunks_lang_check', sql`${t.lang} in (${inList(KB_CHUNK_LANGS)})`),
    check('kb_chunks_published_version_check', sql`${t.isDraft} or ${t.versionId} is not null`),
    check(
      'kb_chunks_valid_range_check',
      sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validUntil} > ${t.validFrom}`,
    ),
  ],
);
