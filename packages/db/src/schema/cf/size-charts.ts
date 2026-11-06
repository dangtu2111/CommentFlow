import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { products } from './products';

const cm = (name: string) => numeric(name, { precision: 6, scale: 1 });

/**
 * Bảng size có cấu trúc (FR-149, docs/10 `size_charts`, Q-ST1). Mỗi dòng = một size với khoảng chiều cao/cân nặng
 * (cận mở một đầu được; biên đóng hai đầu). Theo sản phẩm (`product_id`) HOẶC theo danh mục (`category_norm`), đúng một.
 * `size` đã in hoa, `category_norm` do code tính (`parseSizeChartRow`). Owner (hoặc hệ thống) ghi.
 */
export const sizeCharts = cf.table(
  'size_charts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    productId: uuid('product_id'),
    category: text('category'),
    categoryNorm: text('category_norm'),
    size: text('size').notNull(),
    heightMinCm: cm('height_min_cm'),
    heightMaxCm: cm('height_max_cm'),
    weightMinKg: cm('weight_min_kg'),
    weightMaxKg: cm('weight_max_kg'),
    measures: jsonb('measures').notNull().default(sql`'{}'::jsonb`),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'size_charts_product_fk',
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }).onDelete('cascade'),
    uniqueIndex('size_charts_product_size_unique')
      .on(t.workspaceId, t.productId, t.size)
      .where(sql`${t.productId} IS NOT NULL`),
    uniqueIndex('size_charts_category_size_unique')
      .on(t.workspaceId, t.categoryNorm, t.size)
      .where(sql`${t.productId} IS NULL`),
    index('size_charts_product_idx').on(t.workspaceId, t.productId),
    index('size_charts_category_idx').on(t.workspaceId, t.categoryNorm),
    check(
      'size_charts_scope_check',
      sql`num_nonnulls(${t.productId}, ${t.categoryNorm}) = 1 AND (${t.category} IS NULL) = (${t.categoryNorm} IS NULL)`,
    ),
    check('size_charts_size_check', sql`char_length(${t.size}) between 1 and 20`),
    check(
      'size_charts_category_check',
      sql`${t.categoryNorm} IS NULL OR (char_length(${t.category}) between 1 and 100 AND char_length(${t.categoryNorm}) between 1 and 100)`,
    ),
    check(
      'size_charts_range_check',
      sql`num_nonnulls(${t.heightMinCm}, ${t.heightMaxCm}, ${t.weightMinKg}, ${t.weightMaxKg}) >= 1
        AND coalesce(${t.heightMinCm}, 1) > 0 AND coalesce(${t.heightMaxCm}, 1) > 0
        AND coalesce(${t.weightMinKg}, 1) > 0 AND coalesce(${t.weightMaxKg}, 1) > 0
        AND (${t.heightMinCm} IS NULL OR ${t.heightMaxCm} IS NULL OR ${t.heightMinCm} <= ${t.heightMaxCm})
        AND (${t.weightMinKg} IS NULL OR ${t.weightMaxKg} IS NULL OR ${t.weightMinKg} <= ${t.weightMaxKg})`,
    ),
    check('size_charts_note_check', sql`${t.note} IS NULL OR char_length(${t.note}) <= 200`),
    check('size_charts_measures_check', sql`jsonb_typeof(${t.measures}) = 'object'`),
  ],
);
