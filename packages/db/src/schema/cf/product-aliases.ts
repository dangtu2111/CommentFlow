import { sql } from 'drizzle-orm';
import { check, foreignKey, index, text, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { products } from './products';

/** Khớp `PRODUCT_ALIAS_SOURCES` ở `@flow/shared`. */
export const PRODUCT_ALIAS_SOURCE_VALUES = ['staff', 'import', 'ai_suggested'] as const;

/**
 * Bí danh sản phẩm (FR-128, docs/10 `product_aliases`, Q-PA1). `alias_norm` do code tính (`parseProductAlias`).
 * Không có UPDATE: sửa = xóa + tạo lại. `confirmed_by` chỉ được là người đang ghi (RLS).
 */
export const productAliases = cf.table(
  'product_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    alias: text('alias').notNull(),
    aliasNorm: text('alias_norm').notNull(),
    source: text('source').notNull().default('staff'),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'product_aliases_product_fk',
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }).onDelete('cascade'),
    unique('product_aliases_workspace_norm_product_unique').on(
      t.workspaceId,
      t.aliasNorm,
      t.productId,
    ),
    index('product_aliases_product_idx').on(t.workspaceId, t.productId),
    index('product_aliases_norm_trgm_idx').using('gin', t.aliasNorm.op('gin_trgm_ops')),
    check(
      'product_aliases_source_check',
      sql`${t.source} IN (${sql.raw(PRODUCT_ALIAS_SOURCE_VALUES.map((v) => `'${v}'`).join(', '))})`,
    ),
    check('product_aliases_alias_check', sql`char_length(${t.alias}) between 1 and 100`),
    check('product_aliases_norm_check', sql`char_length(${t.aliasNorm}) between 1 and 100`),
  ],
);
