import { unsafeMarkMasked } from '@flow/shared';
import type { DraftSource } from '../draft/draft-prompt';
import { scanInjection } from '../injection/injection-scan';
import type { RouteVariant } from '../route/sql-lookup';

/**
 * Dựng "nguồn" cho bước soạn (FR-029) từ kết quả tìm kiếm (FR-028). Thuần, không I/O.
 * Nguồn là dữ liệu shop tự nhập (đoạn kiến thức, biến thể sản phẩm), không có PII của khách nên đánh dấu
 * đã che bằng `unsafeMarkMasked`; câu hỏi của khách không bao giờ nằm trong nguồn.
 */

/** Đoạn kiến thức tìm được (cùng dạng với `KbSearchHit` của `@flow/db`, khai báo lại để `ai` không phụ thuộc kiểu db). */
export type KbHit = {
  id: string;
  chunkKey: string;
  content: string;
  contextHeader: string | null;
  productId: string | null;
  /** `kb_chunks.metadata` (chủ đề `topic`, cờ mâu thuẫn `conflict_group`/`conflict_values`); thiếu = không có. */
  metadata?: Record<string, unknown> | null;
  /** Điểm RRF (k=60) của `searchKbChunks` — CHỈ để xếp thứ tự. */
  score: number;
  /** Cosine tuyệt đối câu hỏi ↔ đoạn (cùng model embedding); thiếu/`null` = tìm không có vector. */
  cosine?: number | null;
};

/** Điểm RRF tối đa: đoạn đứng hạng 1 ở cả ba nhánh (vector, toàn văn, trigram): 3/(60+1). */
export const MAX_RRF_SCORE = 3 / 61;
/** Ngưỡng liên quan khởi điểm (Q-RT1; hiệu chuẩn ở AI-EVAL). */
export const DEFAULT_MIN_RELEVANCE_RETRIEVE = 0.25;
/** Trần token của khối nguồn kiến thức (docs/09 §4: ~3.000). */
export const DEFAULT_MAX_SOURCE_TOKENS = 3000;

/** Điểm RRF → 0..1 để so với ngưỡng liên quan; không phải số tự chấm của model (nguyên tắc #9). */
/**
 * Ngưỡng cosine (bge-m3) để một đoạn kiến thức được coi là "đủ liên quan". Hiệu chỉnh THEO DỮ LIỆU (Nhóm R, 08/11/2026, bộ đoạn đúng đã gán của
 * demo-shop + sswiftly; `docs/testing/eval-nhom-r-2026-11-08.md`): ở 0,30 recall 100% trên cả hai bộ; F1 lớn nhất (0,59) chỉ giữ 62% câu có đáp án
 * (câu tiếng Việt KHÔNG dấu có cosine thấp 0,31–0,39) nên KHÔNG dùng. Cosine một mình không tách được đoạn "cùng chủ đề nhưng không trả lời" —
 * việc đó do rerank (cross-encoder) và `decideAction`/bước soạn đảm nhiệm.
 */
export const KB_MIN_COSINE = 0.3;

/**
 * Cosine → điểm liên quan trên CÙNG thang với ngưỡng chung `DEFAULT_MIN_RELEVANCE` (0,35): dịch sao cho cosine = `KB_MIN_COSINE` đúng bằng ngưỡng chung,
 * đơn điệu, kẹp 0..1. Nhờ vậy một ngưỡng duy nhất ở mọi nơi lọc (pipeline, bộ soạn) mà đoạn kiến thức vẫn quyết định bằng điểm tuyệt đối.
 */
export function kbRelevanceFromCosine(cosine: number): number {
  return Math.min(1, Math.max(0, cosine - KB_MIN_COSINE + KB_RELEVANCE_FLOOR));
}
/**
 * Ngưỡng điểm RERANK (bge-reranker-v2-m3, sigmoid 0..1) để đoạn được coi là "đủ liên quan" — CHỈ áp cho câu được rerank (tiếng Anh, tiếng Việt có dấu; xem `shouldRerank`).
 * Hiệu chỉnh theo dữ liệu (Nhóm R, 08/11/2026, gộp sswiftly + demo-shop: 21 mẫu dương = đoạn đúng, 11 mẫu âm = câu không có nguồn): điểm của reranker rất THẤP và trải rộng
 * (đoạn đúng 0,0005–0,99; đoạn sai ở câu COD ≤ 0,0020), nên ngưỡng nằm ở cỡ 0,002: ở **0,0021** recall 90,5% (19/21), nhận nhầm 36,4% (4/11) và các câu COD (đoạn ship, điểm ≤ 0,0020)
 * bị loại; F1 tối đa (0,875) ở 0,0005 nhưng nhận nhầm 54,5% và KHÔNG loại được câu COD. Số đo đầy đủ: docs/testing/eval-nhom-r-2026-11-08.md.
 */
export const KB_MIN_RERANK = 0.0021;

/** Điểm rerank → điểm liên quan trên cùng thang với ngưỡng chung (rerank = `KB_MIN_RERANK` ⇒ đúng bằng `DEFAULT_MIN_RELEVANCE`); đơn điệu, kẹp 0..1. */
export function kbRelevanceFromRerank(score: number): number {
  return Math.min(1, Math.max(0, score - KB_MIN_RERANK + KB_RELEVANCE_FLOOR));
}

/** Bằng `DEFAULT_MIN_RELEVANCE` của bộ soạn (khai ở đây để `retrieve` không import ngược `draft`; có test khóa hai giá trị bằng nhau). */
const KB_RELEVANCE_FLOOR = 0.35;

export function rrfRelevance(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(1, score / MAX_RRF_SCORE);
}

/** Ước lượng token bảo thủ (tiếng Việt có dấu tốn nhiều token hơn tiếng Anh): ký tự / 3, làm tròn lên. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function formatVnd(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

function describeStock(stock: number | null): string {
  if (stock === null) return 'chưa rõ tồn kho';
  return stock > 0 ? `còn ${stock}` : 'hết hàng';
}

function describeVariant(variant: RouteVariant): string {
  const attrs = Object.entries(variant.attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key} ${value}`)
    .join(', ');
  const price = variant.priceVnd === null ? 'chưa có giá' : `giá ${formatVnd(variant.priceVnd)}`;
  return `Biến thể${attrs === '' ? '' : ` ${attrs}`}: ${price}, ${describeStock(variant.stock)}`;
}

/** Giá/tồn lấy từ `product_variants` (nguyên tắc #4); không bao giờ từ vector/cache. Điểm liên quan 1 vì tra chính xác. */
export function variantsToSources(variants: readonly RouteVariant[]): DraftSource[] {
  return variants.map((variant) => ({
    id: `variant:${variant.id}`,
    kind: 'product',
    text: unsafeMarkMasked(describeVariant(variant)),
    relevance: 1,
  }));
}

export type KbSourceOptions = {
  /** Sản phẩm của bài/đã nhận: đoạn của các sản phẩm này xếp trước kiến thức chung. */
  productIds: readonly string[];
  minRelevance?: number;
  maxTokens?: number;
  /** Miền của shop: link tới đó không bị coi là link lạ khi quét cài lệnh (FR-164). */
  allowedDomains?: readonly string[];
};

type Candidate = { source: DraftSource; tokens: number; productTier: boolean };

/**
 * Lọc ngưỡng liên quan → xếp (sản phẩm gắn bài trước kiến thức chung, rồi điểm giảm dần; hòa giữ thứ tự) →
 * nhặt tham lam đến trần token (đoạn không vừa bị bỏ, đoạn nhỏ hơn phía sau vẫn có thể vào).
 */
export function kbHitsToSources(
  hits: readonly KbHit[],
  options: KbSourceOptions,
): { sources: DraftSource[]; truncated: boolean; quarantined: string[] } {
  const minRelevance = options.minRelevance ?? DEFAULT_MIN_RELEVANCE_RETRIEVE;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_SOURCE_TOKENS;
  const candidates: Candidate[] = [];
  const quarantined: string[] = [];
  for (const hit of hits) {
    const relevance = rrfRelevance(hit.score);
    if (relevance < minRelevance) continue;
    const text = hit.contextHeader ? `${hit.contextHeader}\n${hit.content}` : hit.content;
    // Lớp phòng thủ thứ hai (FR-164): đoạn nghi cài lệnh không vào prompt dù DB chưa đánh dấu.
    if (scanInjection(text, { allowedDomains: options.allowedDomains }).suspected) {
      quarantined.push(hit.id);
      continue;
    }
    candidates.push({
      source: { id: `kb:${hit.id}`, kind: 'kb', text: unsafeMarkMasked(text), relevance },
      tokens: estimateTokens(text),
      productTier: hit.productId !== null && options.productIds.includes(hit.productId),
    });
  }
  candidates.sort(
    (a, b) =>
      Number(b.productTier) - Number(a.productTier) || b.source.relevance - a.source.relevance,
  );

  const sources: DraftSource[] = [];
  let used = 0;
  let truncated = false;
  for (const candidate of candidates) {
    if (used + candidate.tokens > maxTokens) {
      truncated = true;
      continue;
    }
    used += candidate.tokens;
    sources.push(candidate.source);
  }
  return { sources, truncated, quarantined };
}
