import type { ImportProductPlan } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

export type ProductImportResult = {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
};

type UpsertedProduct = { id: string; inserted: boolean; locked_fields: string[] };

/**
 * Ghi kế hoạch nhập Excel/CSV vào `products`/`product_variants` (KB-IMPORT-EXCEL, FR-051, Q-KBIX1). PHẢI gọi trong
 * MỘT `withActor(workspaceId, userId, …)` (một giao dịch: lỗi giữa chừng → không ghi gì; RLS chỉ cho thành viên).
 * Upsert theo `(workspace_id, source='excel', external_id)` nên chạy lại cùng file không nhân đôi. Trường nằm trong
 * `locked_fields` của sản phẩm (tên, giá, giá gốc, tồn, danh mục, link) KHÔNG bị ghi đè; khóa giá/tồn cũng giữ giá/tồn
 * của biến thể. Không xóa/lưu trữ sản phẩm vắng trong file. Giá/tồn không vào `search_text` (nguyên tắc #4).
 */
export async function applyProductImport(
  tx: Database,
  workspaceId: string,
  plan: readonly ImportProductPlan[],
  importedAt: Date = new Date(),
): Promise<ProductImportResult> {
  const result: ProductImportResult = {
    productsCreated: 0,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
  };
  const at = importedAt.toISOString();

  for (const product of plan) {
    const upserted = await tx.execute<UpsertedProduct>(sql`
      INSERT INTO cf.products AS p (workspace_id, source, external_id, name, price_vnd, compare_at_vnd, stock,
                                    variants, url, category, search_text, updated_from_source_at)
      VALUES (${workspaceId}::uuid, 'excel', ${product.externalId}, ${product.name}, ${product.priceVnd},
              ${product.compareAtVnd}, ${product.stock}, ${JSON.stringify(product.variantsSnapshot)}::jsonb,
              ${product.url}, ${product.category}, ${product.searchText}, ${at}::timestamptz)
      ON CONFLICT (workspace_id, source, external_id) DO UPDATE SET
        name = CASE WHEN 'name' = ANY(p.locked_fields) THEN p.name ELSE EXCLUDED.name END,
        search_text = CASE WHEN 'name' = ANY(p.locked_fields) THEN p.search_text ELSE EXCLUDED.search_text END,
        price_vnd = CASE WHEN 'price_vnd' = ANY(p.locked_fields) THEN p.price_vnd ELSE EXCLUDED.price_vnd END,
        compare_at_vnd = CASE WHEN 'compare_at_vnd' = ANY(p.locked_fields) THEN p.compare_at_vnd
                              ELSE EXCLUDED.compare_at_vnd END,
        stock = CASE WHEN 'stock' = ANY(p.locked_fields) THEN p.stock ELSE EXCLUDED.stock END,
        url = CASE WHEN 'url' = ANY(p.locked_fields) THEN p.url ELSE COALESCE(EXCLUDED.url, p.url) END,
        category = CASE WHEN 'category' = ANY(p.locked_fields) THEN p.category
                        ELSE COALESCE(EXCLUDED.category, p.category) END,
        variants = CASE WHEN p.locked_fields && ARRAY['price_vnd', 'compare_at_vnd', 'stock']::text[]
                        THEN p.variants ELSE EXCLUDED.variants END,
        updated_from_source_at = EXCLUDED.updated_from_source_at,
        updated_at = now()
      RETURNING p.id, (xmax = 0) AS inserted, p.locked_fields`);
    const row = upserted.rows[0] as UpsertedProduct;
    if (row.inserted) result.productsCreated += 1;
    else result.productsUpdated += 1;
    const priceLocked = row.locked_fields.includes('price_vnd');
    const compareLocked = row.locked_fields.includes('compare_at_vnd');
    const stockLocked = row.locked_fields.includes('stock');

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
          price_vnd = CASE WHEN ${priceLocked}::boolean THEN v.price_vnd ELSE EXCLUDED.price_vnd END,
          compare_at_vnd = CASE WHEN ${compareLocked}::boolean THEN v.compare_at_vnd
                                ELSE EXCLUDED.compare_at_vnd END,
          stock = CASE WHEN ${stockLocked}::boolean THEN v.stock ELSE EXCLUDED.stock END,
          updated_from_source_at = EXCLUDED.updated_from_source_at,
          updated_at = now()
        RETURNING (xmax = 0) AS inserted`);
      if ((written.rows[0] as { inserted: boolean }).inserted) result.variantsCreated += 1;
      else result.variantsUpdated += 1;
    }
  }
  return result;
}
