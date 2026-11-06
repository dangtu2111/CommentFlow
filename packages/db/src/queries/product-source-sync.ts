import type { ImportProductPlan } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/** Nguồn ngoài có API chính thức (docs/12 §4); khớp CHECK `products_source_check` (migration 0034). */
export type ExternalProductSource = 'shopify' | 'haravan' | 'sapo';

/** Trường lấy từ nguồn nên khóa không cho sửa tay trong CommentFlow (docs/12 §4.1 "Khóa trường"). */
const SOURCE_LOCKED_FIELDS = ['name', 'price_vnd', 'compare_at_vnd', 'stock'];

export type ProductSourceSyncResult = {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
};

/**
 * Ghi kế hoạch đồng bộ từ nguồn ngoài (SHOPIFY-IMPORT, FR-052, Q-SHI1) vào `products`/`product_variants`. PHẢI gọi
 * trong MỘT giao dịch có ngữ cảnh workspace (`withActor`/`withJob`; RLS chặn workspace khác). Upsert theo
 * `(workspace_id, source, external_id)` nên chạy lại không nhân đôi. KHÁC `applyProductImport`: nguồn ngoài là nguồn
 * đúng nên GHI ĐÈ tên/giá/giá gốc/tồn/biến thể kể cả khi đã nằm trong `locked_fields` (khóa chỉ chặn sửa tay), và hợp
 * nhất `locked_fields` với bộ trường nguồn. Không xóa/lưu trữ sản phẩm vắng mặt (đối soát: SHOPIFY-RECONCILE). Giá/tồn
 * không vào `search_text` (nguyên tắc #4).
 */
export async function applyProductSourceSync(
  tx: Database,
  workspaceId: string,
  source: ExternalProductSource,
  plan: readonly ImportProductPlan[],
  syncedAt: Date = new Date(),
): Promise<ProductSourceSyncResult> {
  const result: ProductSourceSyncResult = {
    productsCreated: 0,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
  };
  const at = syncedAt.toISOString();
  const locked = sql`ARRAY[${sql.join(
    SOURCE_LOCKED_FIELDS.map((field) => sql`${field}`),
    sql`, `,
  )}]::text[]`;

  for (const product of plan) {
    const upserted = await tx.execute<{ id: string; inserted: boolean }>(sql`
      INSERT INTO cf.products AS p (workspace_id, source, external_id, name, price_vnd, compare_at_vnd, stock,
                                    variants, url, category, search_text, locked_fields, updated_from_source_at)
      VALUES (${workspaceId}::uuid, ${source}, ${product.externalId}, ${product.name}, ${product.priceVnd},
              ${product.compareAtVnd}, ${product.stock}, ${JSON.stringify(product.variantsSnapshot)}::jsonb,
              ${product.url}, ${product.category}, ${product.searchText}, ${locked}, ${at}::timestamptz)
      ON CONFLICT (workspace_id, source, external_id) DO UPDATE SET
        name = EXCLUDED.name,
        search_text = EXCLUDED.search_text,
        price_vnd = EXCLUDED.price_vnd,
        compare_at_vnd = EXCLUDED.compare_at_vnd,
        stock = EXCLUDED.stock,
        url = EXCLUDED.url,
        category = EXCLUDED.category,
        variants = EXCLUDED.variants,
        locked_fields = ARRAY(SELECT DISTINCT unnest(p.locked_fields || EXCLUDED.locked_fields)),
        updated_from_source_at = EXCLUDED.updated_from_source_at,
        updated_at = now()
      RETURNING p.id, (xmax = 0) AS inserted`);
    const row = upserted.rows[0] as { id: string; inserted: boolean };
    if (row.inserted) result.productsCreated += 1;
    else result.productsUpdated += 1;

    for (const variant of product.variants) {
      const written = await tx.execute<{ inserted: boolean }>(sql`
        INSERT INTO cf.product_variants AS v (workspace_id, product_id, external_id, sku, attrs, attrs_norm,
                                              price_vnd, compare_at_vnd, stock, updated_from_source_at)
        VALUES (${workspaceId}::uuid, ${row.id}::uuid, ${variant.externalId}, ${variant.sku},
                ${JSON.stringify(variant.attrs)}::jsonb, ${JSON.stringify(variant.attrsNorm)}::jsonb,
                ${variant.priceVnd}, ${variant.compareAtVnd}, ${variant.stock}, ${at}::timestamptz)
        ON CONFLICT (workspace_id, product_id, external_id) DO UPDATE SET
          sku = EXCLUDED.sku,
          attrs = EXCLUDED.attrs,
          attrs_norm = EXCLUDED.attrs_norm,
          price_vnd = EXCLUDED.price_vnd,
          compare_at_vnd = EXCLUDED.compare_at_vnd,
          stock = EXCLUDED.stock,
          updated_from_source_at = EXCLUDED.updated_from_source_at,
          updated_at = now()
        RETURNING (xmax = 0) AS inserted`);
      if ((written.rows[0] as { inserted: boolean }).inserted) result.variantsCreated += 1;
      else result.variantsUpdated += 1;
    }
  }
  return result;
}
