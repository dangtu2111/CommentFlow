import {
  decideSize,
  normalizeSearchText,
  type SizeChartRange,
  type SizeChartRowInput,
  type SizeDecision,
  type SizeMeasurements,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Bảng size (FR-149, migration 0044, Q-ST1). Đầu vào ghi PHẢI đã qua `parseSizeChartRow` (`@flow/shared`).
 * Ghi: `withActor` (Owner) hoặc `withJob`; RLS chặn Staff, workspace khác, người ngoài.
 */
export type SizeChartRow = SizeChartRange & {
  id: string;
  productId: string | null;
  category: string | null;
  measures: Record<string, string | number>;
  sortOrder: number;
};

type RawRow = {
  id: string;
  product_id: string | null;
  category: string | null;
  size: string;
  height_min_cm: string | null;
  height_max_cm: string | null;
  weight_min_kg: string | null;
  weight_max_kg: string | null;
  measures: Record<string, string | number>;
  note: string | null;
  sort_order: number;
};

const COLUMNS = sql`id, product_id, category, size, height_min_cm, height_max_cm, weight_min_kg,
  weight_max_kg, measures, note, sort_order`;

// numeric(6,1) về từ pg dạng chuỗi.
const num = (v: string | null): number | null => (v === null ? null : Number(v));

function toRow(r: RawRow): SizeChartRow {
  return {
    id: r.id,
    productId: r.product_id,
    category: r.category,
    size: r.size,
    heightMinCm: num(r.height_min_cm),
    heightMaxCm: num(r.height_max_cm),
    weightMinKg: num(r.weight_min_kg),
    weightMaxKg: num(r.weight_max_kg),
    measures: r.measures,
    note: r.note,
    sortOrder: r.sort_order,
  };
}

/** Thêm một dòng. Trùng size trong cùng phạm vi → 23505; sản phẩm không thuộc workspace → 23503. */
export async function createSizeChartRow(
  tx: Database,
  workspaceId: string,
  input: SizeChartRowInput,
): Promise<string> {
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.size_charts (workspace_id, product_id, category, category_norm, size, height_min_cm,
      height_max_cm, weight_min_kg, weight_max_kg, measures, note, sort_order)
    VALUES (${workspaceId}::uuid, ${input.productId}::uuid, ${input.category}, ${input.categoryNorm},
      ${input.size}, ${input.heightMinCm}, ${input.heightMaxCm}, ${input.weightMinKg}, ${input.weightMaxKg},
      ${JSON.stringify(input.measures)}::jsonb, ${input.note}, ${input.sortOrder})
    RETURNING id`);
  const row = r.rows[0];
  if (!row) throw new Error('insert size_charts không trả dòng nào');
  return row.id;
}

/** Sửa phần có thể sửa (size, khoảng, số đo, ghi chú, thứ tự); phạm vi sản phẩm/danh mục không đổi. `false` khi không thấy. */
export async function updateSizeChartRow(
  tx: Database,
  workspaceId: string,
  id: string,
  input: SizeChartRowInput,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.size_charts SET size = ${input.size}, height_min_cm = ${input.heightMinCm},
      height_max_cm = ${input.heightMaxCm}, weight_min_kg = ${input.weightMinKg},
      weight_max_kg = ${input.weightMaxKg}, measures = ${JSON.stringify(input.measures)}::jsonb,
      note = ${input.note}, sort_order = ${input.sortOrder}, updated_at = now()
    WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

/** `false` khi id không thấy được (workspace khác, đã xóa). */
export async function deleteSizeChartRow(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(
    sql`DELETE FROM cf.size_charts WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`,
  );
  return (r.rowCount ?? 0) > 0;
}

/** Các dòng của một sản phẩm (`{productId}`) hoặc một danh mục (`{category}`) cho màn quản trị, theo thứ tự nhập. */
export async function listSizeChartRows(
  tx: Database,
  workspaceId: string,
  scope: { productId: string } | { category: string },
): Promise<SizeChartRow[]> {
  const where =
    'productId' in scope
      ? sql`product_id = ${scope.productId}::uuid`
      : sql`product_id IS NULL AND category_norm = ${normalizeSearchText(scope.category)}`;
  const r = await tx.execute<RawRow>(sql`
    SELECT ${COLUMNS} FROM cf.size_charts
    WHERE workspace_id = ${workspaceId}::uuid AND ${where}
    ORDER BY sort_order, created_at, id`);
  return r.rows.map(toRow);
}

export type SizeChartScope = 'product' | 'category' | 'none';

/**
 * Chọn bảng size áp dụng: bảng riêng của sản phẩm nếu có dòng nào, nếu không thì bảng của danh mục sản phẩm
 * (so khớp `category_norm`), nếu không thì rỗng. Bảng riêng của sản phẩm LUÔN thắng danh mục (không trộn hai bảng).
 */
export async function findSizeChartRows(
  tx: Database,
  input: { workspaceId: string; productId: string; category?: string | null },
): Promise<{ scope: SizeChartScope; rows: SizeChartRow[] }> {
  const own = await tx.execute<RawRow>(sql`
    SELECT ${COLUMNS} FROM cf.size_charts
    WHERE workspace_id = ${input.workspaceId}::uuid AND product_id = ${input.productId}::uuid
    ORDER BY sort_order, created_at, id`);
  if (own.rows.length > 0) return { scope: 'product', rows: own.rows.map(toRow) };

  const categoryNorm = input.category ? normalizeSearchText(input.category) : '';
  if (categoryNorm === '') return { scope: 'none', rows: [] };
  const byCategory = await tx.execute<RawRow>(sql`
    SELECT ${COLUMNS} FROM cf.size_charts
    WHERE workspace_id = ${input.workspaceId}::uuid AND product_id IS NULL AND category_norm = ${categoryNorm}
    ORDER BY sort_order, created_at, id`);
  return byCategory.rows.length > 0
    ? { scope: 'category', rows: byCategory.rows.map(toRow) }
    : { scope: 'none', rows: [] };
}

/** Tra size cho một sản phẩm: chọn bảng (`findSizeChartRows`) rồi để code quyết định (`decideSize`). */
export async function lookupSize(
  tx: Database,
  input: {
    workspaceId: string;
    productId: string;
    category?: string | null;
  } & SizeMeasurements,
): Promise<SizeDecision & { scope: SizeChartScope }> {
  const { scope, rows } = await findSizeChartRows(tx, input);
  return { ...decideSize(rows, input), scope };
}
