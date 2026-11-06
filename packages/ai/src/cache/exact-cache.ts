import { createHash } from 'node:crypto';
import { AppError, isProductCacheStale } from '@flow/shared';
import { z } from 'zod';
import { extractClaims, type GuardClaimKind } from '../guard-money';

/**
 * Bước `cacheLookup` — cache khớp chính xác (FR-026, FR-135; docs/09 §4, docs/10 §5.3).
 *
 * Khóa: `cf:{workspace_id}:cache:exact:{kb_version}:{post|-}:{sha256(lang + câu chuẩn hóa)}`.
 *  - luôn có `workspace_id` ở đầu (nguyên tắc bất biến 2) → không lẫn giữa shop;
 *  - có `kb_version` → xuất bản kiến thức mới là cache cũ tự không còn được tra tới;
 *  - chỉ có băm của câu, không có văn bản thô của khách (FR-048, nguyên tắc 6).
 * Giá trị kèm `product_revs`; mỗi lần đọc so với `products.rev` hiện tại, lệch → trượt + xóa (không trả giá cũ).
 * Redis thật được nối sau interface `ExactCacheStore` (PIPE-ORCHESTRATOR); cờ `cf.cache.answers` do bên gọi đọc.
 */
export type ExactCacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
};

export type ExactCacheKeyInput = {
  workspaceId: string;
  /** Mã bài (nội bộ); `null` khi tin nhắn riêng/không thuộc bài. */
  postId: string | null;
  /** Số phiên bản kiến thức đã xuất bản mới nhất; 0 khi chưa xuất bản. */
  kbVersion: number;
  lang: 'vi' | 'en';
  /** Câu đã chuẩn hóa + che PII (bước `normalizeAndDetectLang`). */
  normalizedText: string;
};

export const DEFAULT_CACHE_TTL_SECONDS = 86_400;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_ID = /^[A-Za-z0-9_.-]{1,128}$/;

function invalid(message: string): never {
  throw new AppError('VALIDATION_FAILED', `Khóa cache không hợp lệ: ${message}`);
}

export function buildExactCacheKey(input: ExactCacheKeyInput): string {
  if (!UUID.test(input.workspaceId)) invalid('workspace_id phải là uuid');
  if (!Number.isInteger(input.kbVersion) || input.kbVersion < 0)
    invalid('kb_version phải là số nguyên ≥ 0');
  if (input.postId !== null && !POST_ID.test(input.postId))
    invalid('mã bài chứa ký tự không cho phép');
  const text = input.normalizedText.trim();
  if (text === '') invalid('câu rỗng');
  const digest = createHash('sha256').update(`${input.lang}\n${text}`).digest('hex');
  return `cf:${input.workspaceId.toLowerCase()}:cache:exact:${input.kbVersion}:${input.postId ?? '-'}:${digest}`;
}

const cachedAnswerSchema = z.object({
  reply: z.string(),
  variants: z.array(z.string()),
  lang: z.enum(['vi', 'en']),
  sourceIds: z.array(z.string()),
  /** Chỉ câu trả lời đã qua cổng (không chuyển người/khiếu nại) mới được cache. */
  cacheable: z.boolean(),
});
export type CachedAnswer = z.infer<typeof cachedAnswerSchema>;

const entrySchema = z.object({
  answer: cachedAnswerSchema,
  productRevs: z.record(z.string(), z.number().int()),
});

export type ExactCacheDeps = {
  store: ExactCacheStore;
  /** `products.rev` hiện tại của các sản phẩm (id vắng mặt = đã mất). Dùng `getProductRevs` trong `withWorkspace`. */
  getCurrentRevs: (
    workspaceId: string,
    productIds: readonly string[],
  ) => Promise<Readonly<Record<string, number>>>;
  /** Cờ `cf.cache.answers` (docs/09 §10). */
  enabled: boolean;
  ttlSeconds?: number;
};

export type CacheMissReason = 'disabled' | 'absent' | 'stale' | 'corrupt';

export type ExactCacheLookup =
  | { status: 'hit'; answer: CachedAnswer; productRevs: Record<string, number> }
  | { status: 'miss'; reason: CacheMissReason };

export async function lookupExactCache(
  deps: ExactCacheDeps,
  input: ExactCacheKeyInput,
): Promise<ExactCacheLookup> {
  if (!deps.enabled) return { status: 'miss', reason: 'disabled' };
  const key = buildExactCacheKey(input);
  const raw = await deps.store.get(key);
  if (raw === null) return { status: 'miss', reason: 'absent' };

  const entry = parseEntry(raw);
  if (!entry) {
    await deps.store.del(key);
    return { status: 'miss', reason: 'corrupt' };
  }
  const usedIds = Object.keys(entry.productRevs);
  if (usedIds.length > 0) {
    const current = await deps.getCurrentRevs(input.workspaceId, usedIds);
    if (isProductCacheStale(entry.productRevs, current)) {
      await deps.store.del(key);
      return { status: 'miss', reason: 'stale' };
    }
  }
  return { status: 'hit', answer: entry.answer, productRevs: entry.productRevs };
}

function parseEntry(raw: string): z.infer<typeof entrySchema> | null {
  try {
    const parsed = entrySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ExactCacheStoreResult =
  | { stored: true }
  | {
      stored: false;
      reason: 'disabled' | 'not_cacheable' | 'unverifiable_price' | 'personal_data';
    };

const PERSONAL_KINDS: ReadonlySet<GuardClaimKind> = new Set(['phone', 'email']);

export type UncacheableReason = 'not_cacheable' | 'unverifiable_price' | 'personal_data';

/** Luật chung cho cache khớp chính xác và semantic cache: câu nào KHÔNG được ghi (null = được ghi). */
export function findUncacheableReason(
  answer: CachedAnswer,
  productRevs: Readonly<Record<string, number>>,
): UncacheableReason | null {
  if (!answer.cacheable) return 'not_cacheable';
  const claims = [answer.reply, ...answer.variants].flatMap(extractClaims);
  if (claims.some((claim) => PERSONAL_KINDS.has(claim.kind))) return 'personal_data';
  if (Object.keys(productRevs).length === 0 && claims.some((claim) => claim.kind === 'money')) {
    return 'unverifiable_price';
  }
  return null;
}

/**
 * Ghi cache. Hợp đồng với bên gọi:
 *  - `productRevs` = `products.rev` đọc CÙNG LÚC với lần đọc giá để soạn câu (không đọc lại lúc ghi, kẻo gắn giá cũ với rev mới);
 *  - câu có số tiền mà `productRevs` rỗng → không ghi (không có cách kiểm giá cũ sau này, FR-135);
 *  - câu có SĐT/email → không ghi (cache dùng chung mọi khách hỏi cùng câu, không được lộ dữ liệu riêng).
 */
export async function storeExactCache(
  deps: ExactCacheDeps,
  input: ExactCacheKeyInput,
  answer: CachedAnswer,
  productRevs: Readonly<Record<string, number>>,
): Promise<ExactCacheStoreResult> {
  if (!deps.enabled) return { stored: false, reason: 'disabled' };
  const rejected = findUncacheableReason(answer, productRevs);
  if (rejected) return { stored: false, reason: rejected };
  const key = buildExactCacheKey(input);
  await deps.store.set(
    key,
    JSON.stringify({ answer, productRevs }),
    deps.ttlSeconds ?? DEFAULT_CACHE_TTL_SECONDS,
  );
  return { stored: true };
}

/** Bản bộ nhớ (test, và chạy thử khi chưa có Redis). */
export function createMemoryCacheStore(now: () => number = Date.now): ExactCacheStore {
  const items = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key) {
      const item = items.get(key);
      if (!item) return null;
      if (item.expiresAt <= now()) {
        items.delete(key);
        return null;
      }
      return item.value;
    },
    async set(key, value, ttlSeconds) {
      items.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async del(key) {
      items.delete(key);
    },
  };
}
