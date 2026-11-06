import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { halfvec1024 } from './kb';

/** Nguồn sản phẩm (docs/10 §3 `products.source`). */
export const PRODUCT_SOURCES = [
  'manual',
  'excel',
  'google_sheets',
  'shopify',
  'haravan',
  'sapo',
  'kiotviet',
  'pancake',
] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

export const PRODUCT_STATUSES = ['active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Sản phẩm (docs/10 §3, FR-129). Giá/tồn đọc TRỰC TIẾP từ bảng này và `product_variants`, không từ vector (FR-056).
 * `rev` do trigger tăng (migration 0034), người dùng không tự đặt. `card` = thẻ sản phẩm (FR-058, kiểm ở `@flow/shared`).
 * `name_embedding` + chỉ mục tìm kiếm thêm ở KB-SEARCH-FTS.
 */
export const products = cf.table(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('manual'),
    externalId: text('external_id'),
    name: text('name').notNull(),
    sku: text('sku'),
    priceVnd: bigint('price_vnd', { mode: 'number' }),
    compareAtVnd: bigint('compare_at_vnd', { mode: 'number' }),
    stock: integer('stock'),
    /** Bản gốc biến thể từ nguồn, giữ để đối chiếu; nguồn đúng là `product_variants`. */
    variants: jsonb('variants').notNull().default(sql`'[]'::jsonb`),
    url: text('url'),
    lockedFields: text('locked_fields').array().notNull().default(sql`'{}'::text[]`),
    updatedFromSourceAt: timestamptz('updated_from_source_at'),
    searchText: text('search_text').notNull().default(''),
    /** Vector tên sản phẩm (FR-127); đổi KHÔNG tăng `rev`. Ghi bằng `setProductNameEmbedding`. */
    nameEmbedding: halfvec1024('name_embedding'),
    card: jsonb('card').notNull().default(sql`'{}'::jsonb`),
    rev: bigint('rev', { mode: 'number' }).notNull().default(1),
    status: text('status').notNull().default('active'),
    category: text('category'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('products_workspace_id_id_unique').on(t.workspaceId, t.id),
    unique('products_source_external_unique').on(t.workspaceId, t.source, t.externalId),
    index('products_workspace_status_idx').on(t.workspaceId, t.status),
    index('products_search_text_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    check('products_source_check', sql`${t.source} IN (${sqlList(PRODUCT_SOURCES)})`),
    check('products_status_check', sql`${t.status} IN (${sqlList(PRODUCT_STATUSES)})`),
    check('products_card_object_check', sql`jsonb_typeof(${t.card}) = 'object'`),
    check('products_price_check', sql`${t.priceVnd} IS NULL OR ${t.priceVnd} >= 0`),
    check('products_compare_at_check', sql`${t.compareAtVnd} IS NULL OR ${t.compareAtVnd} >= 0`),
    check('products_stock_check', sql`${t.stock} IS NULL OR ${t.stock} >= 0`),
  ],
);

/**
 * Biến thể (size, màu, giá, tồn) — NGUỒN ĐÚNG cho giá/tồn theo biến thể (FR-129). `attrs_norm` đã chuẩn hóa
 * (`normalizeAttrs` ở `@flow/shared`) để tra bằng `attrs_norm @> {...}` (docs/10 §5.2).
 */
export const productVariants = cf.table(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    externalId: text('external_id'),
    sku: text('sku'),
    attrs: jsonb('attrs').notNull().default(sql`'{}'::jsonb`),
    attrsNorm: jsonb('attrs_norm').notNull().default(sql`'{}'::jsonb`),
    priceVnd: bigint('price_vnd', { mode: 'number' }),
    compareAtVnd: bigint('compare_at_vnd', { mode: 'number' }),
    stock: integer('stock'),
    status: text('status').notNull().default('active'),
    updatedFromSourceAt: timestamptz('updated_from_source_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'product_variants_product_fk',
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }).onDelete('cascade'),
    unique('product_variants_external_unique').on(t.workspaceId, t.productId, t.externalId),
    index('product_variants_product_idx').on(t.workspaceId, t.productId),
    index('product_variants_attrs_norm_idx').using('gin', t.attrsNorm),
    check('product_variants_status_check', sql`${t.status} IN (${sqlList(PRODUCT_STATUSES)})`),
    check(
      'product_variants_attrs_object_check',
      sql`jsonb_typeof(${t.attrs}) = 'object' AND jsonb_typeof(${t.attrsNorm}) = 'object'`,
    ),
    check('product_variants_price_check', sql`${t.priceVnd} IS NULL OR ${t.priceVnd} >= 0`),
    check(
      'product_variants_compare_at_check',
      sql`${t.compareAtVnd} IS NULL OR ${t.compareAtVnd} >= 0`,
    ),
    check('product_variants_stock_check', sql`${t.stock} IS NULL OR ${t.stock} >= 0`),
  ],
);
