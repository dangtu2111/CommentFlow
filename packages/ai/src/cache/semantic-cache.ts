import { AppError } from '@flow/shared';
import { z } from 'zod';

/**
 * Semantic cache LiteLLM — cấu hình tối thiểu (PIPE-CACHE-SEMANTIC-STUB, FR-026; docs/09 §4).
 *
 * Chỉ dựng phần `cache` điều khiển TỪNG lần gọi LiteLLM (xem `infra/litellm/semantic-cache.example.yaml`):
 *  - cờ `cf.cache.semantic` MẶC ĐỊNH TẮT → `no-cache` + `no-store` (không đọc, không ghi);
 *  - bật → `namespace` luôn chứa `workspace_id` và `kb_version` (không lẫn giữa shop; xuất bản kiến thức mới
 *    thì cache cũ không còn được tra tới).
 * Chưa nối vào `llm-client`/pipeline và chưa gọi dịch vụ thật. Phần đầy đủ (loại câu có số tiền, so `product_revs`,
 * đo tỉ lệ trúng, nối Redis) → `SEMANTIC-CACHE` ở GĐ5. Giá/tồn kho vẫn đọc từ DB (nguyên tắc 4).
 */
export const SEMANTIC_CACHE_TTL_SECONDS = 6 * 60 * 60;
/** Ngưỡng tương đồng cosine thận trọng; dùng trong cấu hình LiteLLM (`similarity_threshold`). */
export const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.92;

export type SemanticCacheControl =
  | { 'no-cache': true; 'no-store': true }
  | { namespace: string; ttl: number };

export type SemanticCacheInput = {
  /** Cờ `cf.cache.semantic`. */
  enabled: boolean;
  workspaceId: string;
  /** Số phiên bản kiến thức đã xuất bản mới nhất; 0 khi chưa xuất bản. */
  kbVersion: number;
};

const inputSchema = z.object({
  enabled: z.boolean(),
  workspaceId: z.string().uuid(),
  kbVersion: z.number().int().nonnegative(),
});

/** Chỉ đúng chữ `true` mới bật (quy ước cờ môi trường của repo). */
export function isSemanticCacheEnabled(envValue: string | undefined): boolean {
  return envValue === 'true';
}

export function buildSemanticCacheControl(rawInput: SemanticCacheInput): SemanticCacheControl {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Tham số semantic cache không hợp lệ.');
  }
  const { enabled, workspaceId, kbVersion } = parsed.data;
  if (!enabled) return { 'no-cache': true, 'no-store': true };
  return {
    namespace: `cf:${workspaceId}:cache:semantic:${kbVersion}`,
    ttl: SEMANTIC_CACHE_TTL_SECONDS,
  };
}
