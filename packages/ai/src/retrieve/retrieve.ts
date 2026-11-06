import { AppError } from '@flow/shared';
import type { DraftSource } from '../draft/draft-prompt';
import { EMBEDDING_DIMENSIONS, type Embedder } from '../embedding/embedder';
import { executeRoute } from '../route/execute-route';
import { type RouteExtract, type RouteKind, type RouteReason, routeQuery } from '../route/route';
import { lookupVariantsForRoute, type RouteVariant, type VariantLookup } from '../route/sql-lookup';
import { orderByPriority, type PostNoteSourceInput, postNotesToSources } from './data-priority';
import type { KbSearcher } from './kb-searcher';
import { type KbHit, kbHitsToSources, variantsToSources } from './sources';

/**
 * Bước `retrieve` (docs/09 §4, FR-028): chỉ tìm kiến thức cho nhãn cần trả lời; Khiếu nại không soạn.
 * Nối `route` → tra biến thể (giá/tồn từ DB) và/hoặc tìm kiến thức hybrid → gói nguồn cho `draft`.
 * Chưa gồm: rerank, ghi chú bài, câu mẫu shop (§5.4), `resolveProducts`, ghi `retrieval_logs` (cần bảng — làn b).
 */
export type RetrieveDeps = {
  lookupVariants: VariantLookup;
  searchKb: KbSearcher;
  embedder: Embedder;
};

export type RetrieveInput = {
  extract: RouteExtract;
  /** Câu tìm (đã che PII) — do `rewriteQuery` dựng (FR-144). */
  searchQuery: string;
  /** `other` đã chuyển người ở bước nhận ngôn ngữ (FR-159) nên không tới đây. */
  lang: 'vi' | 'en';
  resolvedProductIds: readonly string[];
  minRelevance?: number;
  maxTokens?: number;
  /** Miền của shop: link tới đó không bị cách ly khi quét cài lệnh (FR-164). */
  allowedDomains?: readonly string[];
  /** Ghi chú của bài đang trả lời (FR-062/063); hết hạn thì tự bị loại theo `now`. */
  postNotes?: readonly PostNoteSourceInput[];
  /** Thời điểm xét hiệu lực ghi chú (mặc định: bây giờ; tiêm vào khi test). */
  now?: Date;
};

export type SkipReason = 'complaint' | 'spam';

export type RetrieveResult =
  | { status: 'skipped'; reason: SkipReason }
  | {
      status: 'retrieved';
      route: RouteKind;
      reason: RouteReason;
      variants: RouteVariant[];
      /** Theo FR-063: ghi chú bài, biến thể (giá/tồn từ DB), rồi kiến thức. */
      sources: DraftSource[];
      /** Có đoạn kiến thức bị bỏ vì trần token. */
      truncated: boolean;
      /** Mã đoạn kiến thức bị loại vì nghi cài lệnh (FR-164); để ghi log/báo hàng chờ duyệt. */
      quarantined: string[];
    };

/**
 * Khiếu nại ở BẤT KỲ vị trí nào → không tìm, không soạn (FR-028, FR-145). Spam chỉ khi là nhãn chính
 * (nhãn phụ không được làm mất một câu hỏi thật — Q-RT1).
 */
function skipReason(extract: RouteExtract): SkipReason | null {
  if (extract.labels.some((item) => item.label === 'complaint')) return 'complaint';
  if (extract.labels[0]?.label === 'spam') return 'spam';
  return null;
}

async function embedQuery(embedder: Embedder, text: string): Promise<number[]> {
  const [vector] = await embedder.embed([text]);
  if (vector === undefined || vector.length !== EMBEDDING_DIMENSIONS) {
    // Không tìm bằng vector hỏng; không đính kèm nội dung câu hỏi vào lỗi (nguyên tắc #6).
    throw new AppError('LLM_UNAVAILABLE', 'Embedding câu tìm không hợp lệ.');
  }
  return vector;
}

async function searchKnowledge(deps: RetrieveDeps, input: RetrieveInput): Promise<KbHit[]> {
  const queryText = input.searchQuery.trim();
  if (queryText === '') return [];
  const queryVector = await embedQuery(deps.embedder, queryText);
  return deps.searchKb({
    queryText,
    lang: input.lang,
    queryVector,
    productIds: input.resolvedProductIds,
  });
}

export async function retrieveKnowledge(
  deps: RetrieveDeps,
  input: RetrieveInput,
): Promise<RetrieveResult> {
  const skipped = skipReason(input.extract);
  if (skipped !== null) return { status: 'skipped', reason: skipped };

  const decision = routeQuery({
    extract: input.extract,
    resolvedProductIds: input.resolvedProductIds,
  });
  const outcome = await executeRoute(decision.route, {
    sql: async () =>
      (await lookupVariantsForRoute(deps.lookupVariants, input.resolvedProductIds, input.extract))
        .variants,
    hybrid: () => searchKnowledge(deps, input),
  });

  const variants = outcome.sql ?? [];
  const kb = kbHitsToSources(outcome.hybrid ?? [], {
    productIds: input.resolvedProductIds,
    minRelevance: input.minRelevance,
    maxTokens: input.maxTokens,
    allowedDomains: input.allowedDomains,
  });
  const notes = postNotesToSources(input.postNotes ?? [], input.now ?? new Date(), {
    allowedDomains: input.allowedDomains,
  });
  return {
    status: 'retrieved',
    route: decision.route,
    reason: decision.reason,
    variants,
    // FR-063: ghi chú bài → sản phẩm (giá/tồn từ DB) → kiến thức.
    sources: orderByPriority([...notes.sources, ...variantsToSources(variants), ...kb.sources]),
    truncated: kb.truncated || notes.truncated,
    quarantined: [...kb.quarantined, ...notes.quarantined],
  };
}
