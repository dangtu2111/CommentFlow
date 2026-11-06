import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { posts } from './posts';
import { products } from './products';

/** Khớp `POST_PRODUCT_STATUSES` ở `@flow/shared`. */
export const POST_PRODUCT_STATUS_VALUES = ['suggested', 'confirmed'] as const;

/**
 * Liên kết bài ↔ sản phẩm (FR-061, docs/10 `post_products`, Q-PLP1). `suggested` = AI/hệ thống đề xuất, CHƯA dùng để
 * trả lời; `confirmed` = nhân viên đã xác nhận (`confirmed_by` = người thao tác). Sản phẩm chính chỉ trên liên kết
 * đã xác nhận, tối đa một mỗi bài (chỉ mục duy nhất từng phần). Xác nhận = xóa đề xuất + tạo lại `confirmed`.
 */
export const postProducts = cf.table(
  'post_products',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').notNull(),
    productId: uuid('product_id').notNull(),
    status: text('status').notNull().default('confirmed'),
    isPrimary: boolean('is_primary').notNull().default(false),
    suggestedByAi: boolean('suggested_by_ai').notNull().default(false),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'post_products_pk',
      columns: [t.workspaceId, t.postId, t.productId],
    }),
    foreignKey({
      name: 'post_products_post_fk',
      columns: [t.workspaceId, t.postId],
      foreignColumns: [posts.workspaceId, posts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'post_products_product_fk',
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }).onDelete('cascade'),
    index('post_products_product_idx').on(t.workspaceId, t.productId),
    uniqueIndex('post_products_one_primary_idx')
      .on(t.workspaceId, t.postId)
      .where(sql`${t.isPrimary}`),
    check(
      'post_products_status_check',
      sql`${t.status} IN (${sql.raw(POST_PRODUCT_STATUS_VALUES.map((v) => `'${v}'`).join(', '))})`,
    ),
    check('post_products_primary_check', sql`NOT ${t.isPrimary} OR ${t.status} = 'confirmed'`),
    check('post_products_suggested_check', sql`${t.status} <> 'suggested' OR ${t.suggestedByAi}`),
  ],
);
