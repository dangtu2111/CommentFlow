import { z } from 'zod';
import { AppError } from './errors';
import { maskPii } from './pii';

/**
 * RETRIEVAL-LOG (FR-134): dựng bản ghi `retrieval_logs` và `kb_gaps` từ đầu vào của pipeline. Hàm thuần:
 * che PII (nguyên tắc #6: không lưu nội dung chưa che), cắt độ dài, loại trùng, kiểm ranh giới — DB kiểm lại bằng CHECK.
 */

/** Nhánh truy xuất (FR-136), ghi vào `retrieval_logs.route`. */
export const RETRIEVAL_ROUTES = ['sql', 'hybrid', 'both'] as const;
export type RetrievalRoute = (typeof RETRIEVAL_ROUTES)[number];

/** Chủ đề `kb_gaps.topic` (`docs/10`, FR-141). Một nguồn duy nhất; `packages/ai` dùng lại. */
export const KB_GAP_TOPICS = [
  'shipping',
  'discount',
  'product_info',
  'policy',
  'order_status',
  'size',
  'other',
] as const;
export type KbGapTopic = (typeof KB_GAP_TOPICS)[number];

export const KB_GAP_STATUSES = ['open', 'resolved', 'ignored'] as const;
export type KbGapStatus = (typeof KB_GAP_STATUSES)[number];

/** Ngày giữ `retrieval_logs` (FR-134). */
export const RETRIEVAL_LOG_RETENTION_DAYS = 90;
export const RETRIEVAL_TEXT_MAX_CHARS = 500;
export const RETRIEVAL_MAX_CANDIDATES = 50;
export const RETRIEVAL_MAX_USED_CHUNKS = 20;
export const RETRIEVAL_MAX_PRODUCTS = 20;

const uuid = z.uuid();
const rank = z.number().int().min(1).nullable();

const candidateSchema = z.object({
  chunkId: uuid,
  vecRank: rank,
  ftsRank: rank,
  trgmRank: rank,
  rerankScore: z.number().finite().nullable(),
});

const logInputSchema = z.object({
  query: z.string().trim().min(1),
  searchQuery: z.string().trim().min(1).nullish(),
  lang: z.enum(['vi', 'en']),
  route: z.enum(RETRIEVAL_ROUTES),
  kbVersion: z.number().int().min(1).nullish(),
  draftId: uuid.nullish(),
  commentId: uuid.nullish(),
  candidates: z.array(candidateSchema).max(RETRIEVAL_MAX_CANDIDATES),
  usedChunkIds: z.array(uuid).max(RETRIEVAL_MAX_USED_CHUNKS),
  resolvedProductIds: z.array(uuid).max(RETRIEVAL_MAX_PRODUCTS),
  latencyMs: z.number().int().min(0),
});

export type RetrievalLogInput = z.input<typeof logInputSchema>;

export type RetrievalLogRecord = {
  draftId: string | null;
  commentId: string | null;
  queryMasked: string;
  searchQueryMasked: string | null;
  lang: 'vi' | 'en';
  route: RetrievalRoute;
  kbVersion: number | null;
  candidates: Array<{
    chunk_id: string;
    vec_rank: number | null;
    fts_rank: number | null;
    trgm_rank: number | null;
    rerank_score: number | null;
  }>;
  usedChunkIds: string[];
  resolvedProductIds: string[];
  latencyMs: number;
};

function maskAndCut(text: string): string {
  return maskPii(text).slice(0, RETRIEVAL_TEXT_MAX_CHARS);
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION_FAILED',
      `${what} không hợp lệ: ${parsed.error.issues[0]?.path.join('.') ?? ''}`,
    );
  }
  return parsed.data;
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Dựng bản ghi `retrieval_logs` (đã che PII). Đầu vào sai → `AppError('VALIDATION_FAILED')`. */
export function buildRetrievalLogRecord(input: RetrievalLogInput): RetrievalLogRecord {
  const v = parseOrThrow(logInputSchema, input, 'Nhật ký tìm kiếm');
  return {
    draftId: v.draftId ?? null,
    commentId: v.commentId ?? null,
    queryMasked: maskAndCut(v.query),
    searchQueryMasked: v.searchQuery ? maskAndCut(v.searchQuery) : null,
    lang: v.lang,
    route: v.route,
    kbVersion: v.kbVersion ?? null,
    candidates: v.candidates.map((c) => ({
      chunk_id: c.chunkId,
      vec_rank: c.vecRank,
      fts_rank: c.ftsRank,
      trgm_rank: c.trgmRank,
      rerank_score: c.rerankScore,
    })),
    usedChunkIds: unique(v.usedChunkIds),
    resolvedProductIds: unique(v.resolvedProductIds),
    latencyMs: v.latencyMs,
  };
}

const gapInputSchema = z.object({
  topic: z.enum(KB_GAP_TOPICS),
  sampleQuestion: z.string().trim().min(1),
  productId: uuid.nullish(),
  /** Chủ đề MỊN của sự kiện (mã `FactTopic`, `@flow/ai` kiểm bằng Zod enum); null = chưa rõ/gộp nhiều chủ đề → gap không tự đóng. */
  factTopic: z.string().min(1).max(40).nullish(),
});

export type KbGapInput = z.input<typeof gapInputSchema>;

export type KbGapRecord = {
  topic: KbGapTopic;
  sampleQuestionMasked: string;
  productId: string | null;
  factTopic: string | null;
};

/** Dựng bản ghi `kb_gaps` (đã che PII). Đầu vào sai → `AppError('VALIDATION_FAILED')`. */
export function buildKbGapRecord(input: KbGapInput): KbGapRecord {
  const v = parseOrThrow(gapInputSchema, input, 'Khoảng trống kiến thức');
  return {
    topic: v.topic,
    sampleQuestionMasked: maskAndCut(v.sampleQuestion),
    productId: v.productId ?? null,
    factTopic: v.factTopic ?? null,
  };
}
