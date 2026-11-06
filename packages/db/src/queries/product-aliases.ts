import {
  ALIAS_MATCH_THRESHOLD,
  normalizeSearchText,
  type ProductAliasInput,
  type ProductAliasSource,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Bí danh sản phẩm (FR-128, migration 0043, Q-PA1). Đầu vào PHẢI đã qua `parseProductAlias` (`@flow/shared`).
 * Ghi: `withActor` (Owner/Staff) hoặc `withJob`; RLS chặn workspace khác, người ngoài, giả `confirmed_by`.
 */
export type ProductAliasRow = {
  id: string;
  alias: string;
  source: ProductAliasSource;
  confirmedBy: string | null;
};

export type AliasHit = { id: string; name: string; similarity: number };

/**
 * Thêm bí danh cho một sản phẩm. `confirmedBy` = người đang thao tác (bắt buộc với nguồn `ai_suggested`; RLS buộc
 * trùng người ghi). Trùng (alias_norm, sản phẩm) → 23505; sản phẩm không thuộc workspace → 23503.
 */
export async function createProductAlias(
  tx: Database,
  workspaceId: string,
  productId: string,
  input: ProductAliasInput,
  confirmedBy: string | null = null,
): Promise<string> {
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.product_aliases (workspace_id, product_id, alias, alias_norm, source, confirmed_by)
    VALUES (${workspaceId}::uuid, ${productId}::uuid, ${input.alias}, ${input.aliasNorm}, ${input.source},
            ${confirmedBy}::uuid)
    RETURNING id`);
  const row = r.rows[0];
  if (!row) throw new Error('insert product_aliases không trả dòng nào');
  return row.id;
}

/** `false` khi id không thấy được (workspace khác, đã xóa). */
export async function deleteProductAlias(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(
    sql`DELETE FROM cf.product_aliases WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`,
  );
  return (r.rowCount ?? 0) > 0;
}

/** Bí danh của một sản phẩm (tab "Bí danh"), cũ trước. */
export async function listProductAliases(
  tx: Database,
  workspaceId: string,
  productId: string,
): Promise<ProductAliasRow[]> {
  const r = await tx.execute<{
    id: string;
    alias: string;
    source: ProductAliasSource;
    confirmed_by: string | null;
  }>(sql`
    SELECT id, alias, source, confirmed_by FROM cf.product_aliases
    WHERE workspace_id = ${workspaceId}::uuid AND product_id = ${productId}::uuid
    ORDER BY created_at, id`);
  return r.rows.map((row) => ({
    id: row.id,
    alias: row.alias,
    source: row.source,
    confirmedBy: row.confirmed_by,
  }));
}

/**
 * Tìm sản phẩm theo bí danh (docs/10 §5.1 bước 2): `similarity(alias_norm, q) >= 0,6`, gộp theo sản phẩm lấy điểm
 * cao nhất, chỉ sản phẩm `active` của workspace. Điểm là độ giống trigram 0–1 (cùng thang với `pickProductMatch`).
 */
export async function searchProductsByAlias(
  tx: Database,
  input: { workspaceId: string; queryText: string; limit?: number },
): Promise<AliasHit[]> {
  const normalized = normalizeSearchText(input.queryText);
  if (normalized === '') return [];
  await tx.execute(
    sql`SELECT set_config('pg_trgm.similarity_threshold', ${String(ALIAS_MATCH_THRESHOLD)}, true)`,
  );
  const r = await tx.execute<{ id: string; name: string; s: number }>(sql`
    SELECT p.id, p.name, max(similarity(a.alias_norm, ${normalized})) AS s
      FROM cf.product_aliases a
      JOIN cf.products p ON p.workspace_id = a.workspace_id AND p.id = a.product_id
     WHERE a.workspace_id = ${input.workspaceId}::uuid AND p.status = 'active'
       AND a.alias_norm % ${normalized}
     GROUP BY p.id, p.name
     ORDER BY s DESC, p.id
     LIMIT ${input.limit ?? 5}`);
  return r.rows.map((row) => ({ id: row.id, name: row.name, similarity: Number(row.s) }));
}
