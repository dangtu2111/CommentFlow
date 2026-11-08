/**
 * Logic thuần của tìm kiếm (KB-SEARCH-FTS): chuẩn hóa chuỗi, trộn xếp hạng RRF, chọn sản phẩm theo ngưỡng,
 * kiểm cache theo `product_revs`. Không chạm DB/mạng; truy vấn nằm ở `@flow/db` (`queries/kb-search.ts`).
 */

/** Hằng RRF (docs/10 §5, FR-057). */
export const RRF_K = 60;

/** Ngưỡng điểm tối thiểu để chọn một sản phẩm (docs/10 §5.1; khởi điểm, hiệu chuẩn bằng bộ đánh giá). */
export const PRODUCT_MATCH_THRESHOLD = 0.45;
/**
 * (1b) Vector tên sản phẩm: cosine tối thiểu để được coi là "gần tên" (khởi điểm CHƯA hiệu chuẩn — hiệu chuẩn bằng bộ gold sản phẩm khi có credit đo;
 * bge-m3 cho cosine tên ngắn↔tên dài thường 0,5–0,8). Dưới ngưỡng → vector không cho điểm (không bao giờ chọn sản phẩm chỉ vì "hơi giống").
 */
export const PRODUCT_MIN_COSINE = 0.62;
/** Hạng một phải hơn hạng hai ít nhất biên này, nếu không là mơ hồ → AI hỏi lại (FR-128). */
export const PRODUCT_MATCH_MARGIN = 0.05;

/**
 * Chuẩn hóa chuỗi để so khớp/tìm (FR-127): chữ thường, bỏ dấu (kể cả đ), mọi ký tự không phải chữ-số thành khoảng
 * trắng, gộp khoảng trắng. Lũy đẳng. Khớp với phép `lower(unaccent(...))` ở trigger `kb_chunks_fill_search`.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type ProductSearchInput = {
  name: string;
  sku?: string | null;
  variants?: ReadonlyArray<{ attrs: Record<string, string> }>;
  aliases?: readonly string[];
};

/**
 * Giá trị cột `products.search_text` (docs/10 §3): tên + SKU + thuộc tính biến thể + bí danh, đã chuẩn hóa, bỏ từ
 * trùng (giữ thứ tự xuất hiện đầu). KHÔNG có giá/tồn (kiểu đầu vào không có).
 */
export function productSearchText(product: ProductSearchInput): string {
  const parts = [product.name, product.sku ?? ''];
  for (const variant of product.variants ?? []) {
    for (const [key, value] of Object.entries(variant.attrs)) parts.push(key, value);
  }
  parts.push(...(product.aliases ?? []));
  const seen = new Set<string>();
  for (const word of normalizeSearchText(parts.join(' ')).split(' ')) {
    if (word !== '') seen.add(word);
  }
  return [...seen].join(' ');
}

export type RankedScore = { id: string; score: number };

/**
 * Trộn nhiều danh sách đã xếp hạng (tốt nhất trước) bằng RRF: điểm = Σ 1/(k + hạng). Id trùng trong một danh sách chỉ
 * tính lần đầu. Hòa điểm giữ thứ tự xuất hiện đầu tiên.
 */
export function reciprocalRankFusion(
  rankings: ReadonlyArray<readonly string[]>,
  k: number = RRF_K,
): RankedScore[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    const counted = new Set<string>();
    let rank = 0;
    for (const id of ranking) {
      if (counted.has(id)) continue;
      counted.add(id);
      rank += 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

export type ProductMatch =
  | { status: 'matched'; id: string; score: number }
  | { status: 'ambiguous'; ids: string[] }
  | { status: 'none'; reason: 'no_candidates' | 'below_threshold' };

/** Đổi cosine (vector tên) sang thang điểm của `pickProductMatch`: `PRODUCT_MIN_COSINE` ↔ ngưỡng chọn, 1 ↔ 1; dưới ngưỡng → 0. */
export function productScoreFromCosine(cosine: number): number {
  if (cosine < PRODUCT_MIN_COSINE) return 0;
  const span = 1 - PRODUCT_MIN_COSINE;
  return (
    PRODUCT_MATCH_THRESHOLD + ((cosine - PRODUCT_MIN_COSINE) / span) * (1 - PRODUCT_MATCH_THRESHOLD)
  );
}

/** Điểm LAI mỗi sản phẩm = lớn hơn của độ giống trigram và điểm từ cosine vector tên (thiếu vector → chỉ trigram). */
export function hybridProductScores(
  hits: readonly { id: string; similarity: number; cosine: number | null }[],
): RankedScore[] {
  return hits.map((h) => ({
    id: h.id,
    score: Math.max(h.similarity, h.cosine === null ? 0 : productScoreFromCosine(h.cosine)),
  }));
}

/**
 * Chọn sản phẩm từ ứng viên đã có điểm (FR-127/128): dưới ngưỡng → không chọn; hạng hai sát hạng một → mơ hồ (trả các
 * ứng viên sát nhau để hỏi lại); ngược lại chọn hạng một. Không phụ thuộc thứ tự đầu vào.
 */
export function pickProductMatch(
  candidates: readonly RankedScore[],
  options: { threshold?: number; margin?: number } = {},
): ProductMatch {
  const threshold = options.threshold ?? PRODUCT_MATCH_THRESHOLD;
  const margin = options.margin ?? PRODUCT_MATCH_MARGIN;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const [best, second] = sorted;
  if (!best) return { status: 'none', reason: 'no_candidates' };
  if (best.score < threshold) return { status: 'none', reason: 'below_threshold' };
  const close = sorted.filter((c) => best.score - c.score < margin);
  if (second && close.length > 1) return { status: 'ambiguous', ids: close.map((c) => c.id) };
  return { status: 'matched', id: best.id, score: best.score };
}

/**
 * Cache có trượt không (FR-135, docs/10 §5.3): `cachedRevs` = `product_revs` lưu kèm giá trị cache,
 * `currentRevs` = `products.rev` hiện tại. Lệch một sản phẩm, hoặc sản phẩm đã dùng không còn → trượt (true).
 */
export function isProductCacheStale(
  cachedRevs: Readonly<Record<string, number>>,
  currentRevs: Readonly<Record<string, number>>,
): boolean {
  return Object.entries(cachedRevs).some(([id, rev]) => currentRevs[id] !== rev);
}
