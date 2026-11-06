import { type Database, findActiveVariants } from '@flow/db/runtime';
import { normalizeAttrs } from '@flow/shared';
import type { ExtractResult } from '../classify/extract-result';

/** Biến thể còn hoạt động đọc từ DB (giá/tồn — nguyên tắc #4). Cùng dạng với `ActiveVariant` của `@flow/db`. */
export type RouteVariant = {
  id: string;
  productId: string;
  attrs: Record<string, string>;
  priceVnd: number | null;
  stock: number | null;
};

/** Cổng tra biến thể: `wanted` PHẢI đã chuẩn hóa (`normalizeAttrs`). */
export type VariantLookup = (
  productIds: readonly string[],
  wanted: Record<string, string>,
) => Promise<RouteVariant[]>;

/** Thuộc tính khách hỏi (size, màu) từ `extract`, đã chuẩn hóa như `attrs_norm` (FR-129). */
export function wantedAttrs(
  extract: Pick<ExtractResult, 'size' | 'color'>,
): Record<string, string> {
  const raw: Record<string, string> = {};
  if (extract.size !== null) raw.size = extract.size;
  if (extract.color !== null) raw.color = extract.color;
  return normalizeAttrs(raw);
}

/** Nhánh `sql` của `route`: không sản phẩm → rỗng (không gọi DB); không khớp → rỗng (không đoán). */
export async function lookupVariantsForRoute(
  lookup: VariantLookup,
  productIds: readonly string[],
  extract: Pick<ExtractResult, 'size' | 'color'>,
): Promise<{ wanted: Record<string, string>; variants: RouteVariant[] }> {
  const wanted = wantedAttrs(extract);
  if (productIds.length === 0) return { wanted, variants: [] };
  return { wanted, variants: await lookup(productIds, wanted) };
}

/**
 * Bản nối DB: bọc `findActiveVariants` (đã lọc `workspace_id`, chỉ biến thể `active`). `tx` phải là giao dịch
 * `withActor`/`withJob` của đúng workspace (RLS).
 */
export function createDbVariantLookup(tx: Database, workspaceId: string): VariantLookup {
  return (productIds, wanted) => findActiveVariants(tx, workspaceId, productIds, wanted);
}
