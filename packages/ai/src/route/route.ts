import type { CommentLabel } from '@flow/shared';
import type { ExtractResult } from '../classify/extract-result';
import { classifyAsk, SQL_ASK_TOPICS } from './route-topics';

/**
 * Bước `route` (docs/09 §4, FR-136): chọn nhánh truy xuất theo nhãn + sản phẩm đã nhận. Thuần, 0 chi phí;
 * code chọn (nguyên tắc #9), không hỏi model.
 * - `sql`: chỉ tra `product_variants` (giá/tồn từ DB, nguyên tắc #4), bỏ vector + rerank;
 * - `both`: SQL + hybrid (chưa nhận sản phẩm, hoặc có thêm ý khác);
 * - `hybrid`: chỉ tìm kiến thức.
 * Nhánh ghi vào `retrieval_logs.route` khi nối pipeline.
 */
export const ROUTES = ['sql', 'both', 'hybrid'] as const;
export type RouteKind = (typeof ROUTES)[number];

export type RouteReason =
  | 'sql_product_fact'
  | 'both_no_product'
  | 'both_extra_intent'
  | 'hybrid_other';

export type RouteDecision = { route: RouteKind; reason: RouteReason };

/** Phần của object `extract` mà `route` đọc. */
export type RouteExtract = Pick<
  ExtractResult,
  'labels' | 'size' | 'color' | 'asks' | 'order_intent'
>;

export type RouteInput = {
  extract: RouteExtract;
  /** Sản phẩm đã nhận (bài gắn sản phẩm, bí danh, tên/SKU gần đúng…): rỗng = chưa nhận được. */
  resolvedProductIds: readonly string[];
};

function hasLabel(extract: RouteExtract, label: CommentLabel): boolean {
  return extract.labels.some((item) => item.label === label);
}

/** Có ý giá/mua/size/màu/tồn (tra được bằng SQL) hay không. */
function asksSqlFacts(extract: RouteExtract): boolean {
  return (
    hasLabel(extract, 'price') ||
    hasLabel(extract, 'purchase') ||
    extract.size !== null ||
    extract.color !== null ||
    extract.asks.some((ask) => SQL_ASK_TOPICS.includes(classifyAsk(ask)))
  );
}

/** Có ý ngoài SQL: ý hỏi lạ/ship/đổi trả, hoặc đặt hàng kèm địa chỉ giao (cần phí ship, chính sách). */
function hasExtraIntent(extract: RouteExtract): boolean {
  return (
    extract.asks.some((ask) => classifyAsk(ask) === 'other') ||
    (extract.order_intent !== null && extract.order_intent.address !== null)
  );
}

export function routeQuery(input: RouteInput): RouteDecision {
  const { extract, resolvedProductIds } = input;
  const hybrid: RouteDecision = { route: 'hybrid', reason: 'hybrid_other' };

  if (hasLabel(extract, 'complaint') || hasLabel(extract, 'spam')) return hybrid;
  if (!asksSqlFacts(extract)) return hybrid;
  if (resolvedProductIds.length === 0) return { route: 'both', reason: 'both_no_product' };
  if (hasExtraIntent(extract)) return { route: 'both', reason: 'both_extra_intent' };
  return { route: 'sql', reason: 'sql_product_fact' };
}
