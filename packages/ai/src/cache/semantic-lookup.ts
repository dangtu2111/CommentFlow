import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '@flow/shared';
import { z } from 'zod';
import type { Embedder } from '../embedding/embedder';
import { type CachedAnswer, findUncacheableReason, type UncacheableReason } from './exact-cache';
import {
  DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD,
  SEMANTIC_CACHE_TTL_SECONDS,
} from './semantic-cache';

/**
 * Semantic cache đầy đủ (SEMANTIC-CACHE, FR-026; docs/09 §4) — logic thuần sau interface, chưa nối Redis/pipeline.
 *
 * Câu hỏi diễn đạt khác nhưng đủ giống (cosine ≥ ngưỡng) dùng lại câu trả lời đã lưu, với các chốt chặn:
 *  - namespace `cf:{workspace_id}:cache:semantic:{kb_version}:{bài|-}` → không lẫn shop/bài, xuất bản kiến thức mới
 *    thì mục cũ không còn được tra tới (nguyên tắc 2);
 *  - mục lưu kèm `product_revs`; mỗi lần đọc so `products.rev` hiện tại, lệch → xóa + miss (không trả giá cũ, nguyên tắc 4);
 *  - khác ngôn ngữ, hoặc tập số trong câu hỏi khác câu đã lưu (size 38 ≠ 39) → miss dù vector rất giống;
 *  - luật ghi dùng chung với cache khớp chính xác (`findUncacheableReason`): không ghi câu có SĐT/email, câu có số tiền
 *    mà không có `product_revs`;
 *  - chỉ lưu băm/vector và số, không lưu văn bản thô của khách (nguyên tắc 6).
 * Cờ `cf.cache.semantic` do bên gọi đọc (mặc định TẮT); tắt thì không embed, không đụng store.
 */
export type SemanticEntry = {
  id: string;
  embedding: readonly number[];
  /** JSON của {@link SemanticValue}. */
  value: string;
};

export type SemanticStore = {
  put(namespace: string, entry: SemanticEntry, ttlSeconds: number): Promise<void>;
  /** Mục gần nhất (cosine cao nhất) trong ĐÚNG namespace; không có/hết hạn → null. */
  nearest(
    namespace: string,
    embedding: readonly number[],
  ): Promise<{ entry: SemanticEntry; similarity: number } | null>;
  delete(namespace: string, id: string): Promise<void>;
};

export type SemanticLookupInput = {
  workspaceId: string;
  /** Mã bài (nội bộ); `null` khi tin nhắn riêng/không thuộc bài. */
  postId: string | null;
  /** Số phiên bản kiến thức đã xuất bản mới nhất; 0 khi chưa xuất bản. */
  kbVersion: number;
  lang: 'vi' | 'en';
  /** Câu đã chuẩn hóa + che PII (bước `normalizeAndDetectLang`). */
  normalizedText: string;
};

export type SemanticMissReason =
  | 'disabled'
  | 'absent'
  | 'below_threshold'
  | 'lang_mismatch'
  | 'number_mismatch'
  | 'not_applicable'
  | 'corrupt';

export type SemanticLookup =
  | {
      status: 'hit';
      answer: CachedAnswer;
      similarity: number;
    }
  | { status: 'miss'; reason: SemanticMissReason };

export type SemanticStoreResult =
  | { stored: true }
  | {
      stored: false;
      reason: 'disabled' | 'private_message' | 'product_specific' | UncacheableReason;
    };

export type SemanticCacheDeps = {
  store: SemanticStore;
  embedder: Embedder;
  /** Cờ `cf.cache.semantic` (docs/09 §10). */
  enabled: boolean;
  /** Ngưỡng cosine trong [0,85; 1]; mặc định 0,92. */
  threshold?: number;
  ttlSeconds?: number;
  /** Báo kết quả mỗi lần tra cứu khi cờ bật (`hit` hoặc lý do trượt) để đo tỉ lệ trúng. */
  onOutcome?: (outcome: 'hit' | SemanticMissReason) => void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_ID = /^[A-Za-z0-9_.-]{1,128}$/;

function invalid(message: string): never {
  throw new AppError('VALIDATION_FAILED', `Semantic cache không hợp lệ: ${message}`);
}

export function buildSemanticNamespace(input: SemanticLookupInput): string {
  if (!UUID.test(input.workspaceId)) invalid('workspace_id phải là uuid');
  if (!Number.isInteger(input.kbVersion) || input.kbVersion < 0)
    invalid('kb_version phải là số nguyên ≥ 0');
  if (input.postId !== null && !POST_ID.test(input.postId))
    invalid('mã bài chứa ký tự không cho phép');
  if (input.normalizedText.trim() === '') invalid('câu rỗng');
  return `cf:${input.workspaceId.toLowerCase()}:cache:semantic:${input.kbVersion}:${input.postId ?? '-'}`;
}

/** Cosine; vector rỗng/lệch chiều/độ dài 0 → 0 (không bao giờ NaN). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Băm tập số trong câu (sắp xếp, bỏ trùng) — chặn "size 38" ≈ "size 39"; chỉ lưu băm, không lưu số thô. */
function numberDigest(text: string): string {
  const found = text.normalize('NFKC').match(/\d+/g) ?? [];
  const tokens = [...new Set(found)].sort();
  return createHash('sha256').update(tokens.join(',')).digest('hex');
}

const valueSchema = z.object({
  answer: z.object({
    reply: z.string(),
    variants: z.array(z.string()),
    lang: z.enum(['vi', 'en']),
    sourceIds: z.array(z.string()),
    cacheable: z.boolean(),
  }),
  lang: z.enum(['vi', 'en']),
  numbers: z.string(),
});

function parseValue(raw: string): z.infer<typeof valueSchema> | null {
  try {
    const parsed = valueSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const MIN_SEMANTIC_THRESHOLD = 0.85;

function resolveThreshold(deps: SemanticCacheDeps): number {
  const threshold = deps.threshold ?? DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < MIN_SEMANTIC_THRESHOLD || threshold > 1)
    invalid('ngưỡng độ giống phải trong [0,85; 1]');
  return threshold;
}

async function embedOne(embedder: Embedder, text: string): Promise<number[]> {
  const [vector] = await embedder.embed([text.trim()]);
  if (!vector || vector.length === 0) invalid('embedding rỗng');
  return vector;
}

export async function lookupSemanticCache(
  deps: SemanticCacheDeps,
  input: SemanticLookupInput,
): Promise<SemanticLookup> {
  if (!deps.enabled) return { status: 'miss', reason: 'disabled' };
  if (input.postId === null) return { status: 'miss', reason: 'not_applicable' };
  const threshold = resolveThreshold(deps);
  const namespace = buildSemanticNamespace(input);
  const done = (outcome: SemanticLookup): SemanticLookup => {
    deps.onOutcome?.(outcome.status === 'hit' ? 'hit' : outcome.reason);
    return outcome;
  };
  const miss = (reason: SemanticMissReason) => done({ status: 'miss', reason });

  const embedding = await embedOne(deps.embedder, input.normalizedText);
  const nearest = await deps.store.nearest(namespace, embedding);
  if (!nearest) return miss('absent');
  // Tự tính lại cosine từ vector đã lưu — không tin điểm do store trả (Redis KNN trả khoảng cách).
  const similarity = cosineSimilarity(embedding, nearest.entry.embedding);
  if (similarity < threshold) return miss('below_threshold');

  const value = parseValue(nearest.entry.value);
  if (!value) {
    await deps.store.delete(namespace, nearest.entry.id);
    return miss('corrupt');
  }
  if (value.lang !== input.lang) return miss('lang_mismatch');
  if (value.numbers !== numberDigest(input.normalizedText)) return miss('number_mismatch');
  return done({ status: 'hit', answer: value.answer, similarity });
}

/**
 * Ghi cache. Chỉ câu chung: câu dùng dữ liệu sản phẩm (`productRevs` khác rỗng) hoặc có số tiền/số/%/ngày bị từ chối,
 * vì lúc tra cache chưa biết khách hỏi sản phẩm nào nên không so được `products.rev` (nguyên tắc 4).
 * Tin nhắn riêng (`postId = null`) không dùng semantic cache (nguyên tắc 6).
 */
export async function storeSemanticCache(
  deps: SemanticCacheDeps,
  input: SemanticLookupInput,
  answer: CachedAnswer,
  productRevs: Readonly<Record<string, number>>,
): Promise<SemanticStoreResult> {
  if (!deps.enabled) return { stored: false, reason: 'disabled' };
  if (input.postId === null) return { stored: false, reason: 'private_message' };
  const rejected = findUncacheableReason(answer, productRevs);
  if (rejected) return { stored: false, reason: rejected };
  const texts = [answer.reply, ...answer.variants];
  // Chữ số bất kỳ trong câu trả lời (giá, số lượng, %, ngày…) → coi là dữ liệu có thể đổi, không cache chung.
  const volatile = texts.some((text) => /\d/.test(text.normalize('NFKC')));
  if (volatile || Object.keys(productRevs).length > 0) {
    return { stored: false, reason: 'product_specific' };
  }
  const namespace = buildSemanticNamespace(input);
  const embedding = await embedOne(deps.embedder, input.normalizedText);
  const value = JSON.stringify({
    answer,
    lang: input.lang,
    numbers: numberDigest(input.normalizedText),
  });
  await deps.store.put(
    namespace,
    { id: randomUUID(), embedding, value },
    deps.ttlSeconds ?? SEMANTIC_CACHE_TTL_SECONDS,
  );
  return { stored: true };
}

/** Bản bộ nhớ (test, và chạy thử khi chưa có Redis Stack). */
export function createMemorySemanticStore(now: () => number = Date.now): SemanticStore {
  const spaces = new Map<string, Map<string, { entry: SemanticEntry; expiresAt: number }>>();
  return {
    async put(namespace, entry, ttlSeconds) {
      const space = spaces.get(namespace) ?? new Map();
      space.set(entry.id, { entry, expiresAt: now() + ttlSeconds * 1000 });
      spaces.set(namespace, space);
    },
    async nearest(namespace, embedding) {
      const space = spaces.get(namespace);
      if (!space) return null;
      let best: { entry: SemanticEntry; similarity: number } | null = null;
      for (const [id, item] of space) {
        if (item.expiresAt <= now()) {
          space.delete(id);
          continue;
        }
        const similarity = cosineSimilarity(embedding, item.entry.embedding);
        if (!best || similarity > best.similarity) best = { entry: item.entry, similarity };
      }
      return best;
    },
    async delete(namespace, id) {
      spaces.get(namespace)?.delete(id);
    },
  };
}
