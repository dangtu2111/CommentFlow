import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Biến thể còn hoạt động khớp thuộc tính khách hỏi (docs/10 §5.2, FR-129): `attrs_norm @> wanted`.
 * `wanted` PHẢI đã chuẩn hóa (`normalizeAttrs` ở `@flow/shared`). Không khớp → mảng rỗng ("hết/không có" theo dữ liệu,
 * không đoán). Giá/tồn đọc trực tiếp từ đây (nguyên tắc #4), không qua vector. Gọi trong `withActor`/`withJob`.
 */
export type ActiveVariant = {
  id: string;
  productId: string;
  attrs: Record<string, string>;
  priceVnd: number | null;
  stock: number | null;
};

export async function findActiveVariants(
  tx: Database,
  workspaceId: string,
  productIds: readonly string[],
  wanted: Record<string, string>,
): Promise<ActiveVariant[]> {
  if (productIds.length === 0) return [];
  const result = await tx.execute<{
    id: string;
    product_id: string;
    attrs: Record<string, string>;
    price_vnd: string | null;
    stock: number | null;
  }>(sql`
    SELECT v.id, v.product_id, v.attrs, v.price_vnd, v.stock
      FROM cf.product_variants v
     WHERE v.workspace_id = ${workspaceId}::uuid
       AND v.product_id IN (${sql.join(
         productIds.map((id) => sql`${id}::uuid`),
         sql`, `,
       )})
       AND v.status = 'active'
       AND v.attrs_norm @> ${JSON.stringify(wanted)}::jsonb
     ORDER BY v.product_id, v.id`);
  return result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    attrs: row.attrs,
    priceVnd: row.price_vnd === null ? null : Number(row.price_vnd),
    stock: row.stock,
  }));
}
