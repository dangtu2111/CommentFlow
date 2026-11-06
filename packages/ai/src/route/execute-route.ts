import type { RouteKind } from './route';

export type RouteBranches<S, H> = {
  /** Tra DB (`product_variants`): giá/tồn trực tiếp, không vector. */
  sql: () => Promise<S>;
  /** Tìm kiến thức: vector + full-text + rerank. */
  hybrid: () => Promise<H>;
};

export type RouteOutcome<S, H> = { route: RouteKind; sql?: S; hybrid?: H };

/**
 * Chạy đúng nhánh đã chọn (FR-136): `sql` KHÔNG BAO GIỜ gọi `hybrid` (không vector/rerank — NFR-C6);
 * `both` chạy song song hai nhánh; lỗi của nhánh nào được ném ra, không nuốt.
 */
export async function executeRoute<S, H>(
  route: RouteKind,
  branches: RouteBranches<S, H>,
): Promise<RouteOutcome<S, H>> {
  if (route === 'sql') return { route, sql: await branches.sql() };
  if (route === 'hybrid') return { route, hybrid: await branches.hybrid() };
  const [sql, hybrid] = await Promise.all([branches.sql(), branches.hybrid()]);
  return { route, sql, hybrid };
}
