import type { Embedder } from './embedder';
import { createMlEmbedder, loadMlEmbedderOptions, type MlEmbedderOptions } from './ml-embedder';

/**
 * CẤU HÌNH EMBEDDING (FR-133, bổ sung 08/11/2026): **model đang hoạt động nằm ở DB** (`cf.embedding_state.active_model`); env chỉ còn
 * bật/tắt dịch vụ ml (`ML_EMBED_ENABLED`, `ML_URL`, `ML_API_TOKEN`) — KHÔNG chọn model. Web (ô Thử AI), worker (job `pipeline`) và EVAL đều qua
 * ĐÚNG các hàm này; dịch vụ ml trả model khác model hoạt động → embedder từ chối (ml-embedder).
 *
 * KHÔNG CÓ MOCK KHI CHẠY: thiếu dịch vụ hoặc DB chưa kích hoạt model → `off` (không có embedder): nhánh vector TẮT, chỉ toàn văn/trigram, nơi dùng báo rõ.
 * Test tự cắm embedder giả qua tham số. Đổi model chỉ bằng `kb:switch-embedding`, không đổi riêng cho một lệnh (`docs/workflows/embedding-config.md`).
 */
export type EmbeddingOffReason = 'service_disabled' | 'no_active_model';

export type EmbeddingDescription = {
  kind: 'ml' | 'off';
  /** Model đang hoạt động (từ DB); `null` khi tắt. */
  model: string | null;
  /** Ghi chú cho log/báo cáo/giao diện; KHÔNG chứa URL, khóa hay token. */
  note: string;
};

export type EmbeddingConfig =
  | { kind: 'ml'; model: string; embedder: Embedder; describe: EmbeddingDescription }
  | {
      kind: 'off';
      reason: EmbeddingOffReason;
      model: null;
      embedder: null;
      describe: EmbeddingDescription;
    };

/** Dịch vụ ml từ env (chỉ bật/tắt + địa chỉ); `undefined` = không dùng embedding. */
export const loadEmbeddingService = (
  env: Record<string, string | undefined>,
): MlEmbedderOptions | undefined => loadMlEmbedderOptions(env);

/** Hàm thuần: ghép dịch vụ (env) với model hoạt động (DB). */
export function resolveEmbeddingConfig(
  service: MlEmbedderOptions | undefined,
  activeModel: string | null,
): EmbeddingConfig {
  if (!service) {
    return {
      kind: 'off',
      reason: 'service_disabled',
      model: null,
      embedder: null,
      describe: {
        kind: 'off',
        model: null,
        note: 'TẮT — chưa bật ML_EMBED_ENABLED=true hoặc thiếu ML_URL: không có nhánh vector, chỉ tìm toàn văn/trigram (không dùng vector giả)',
      },
    };
  }
  if (!activeModel) {
    return {
      kind: 'off',
      reason: 'no_active_model',
      model: null,
      embedder: null,
      describe: {
        kind: 'off',
        model: null,
        note: 'TẮT — DB chưa kích hoạt model embedding: chạy kb:switch-embedding <model>; trong lúc đó chỉ tìm toàn văn/trigram',
      },
    };
  }
  return {
    kind: 'ml',
    model: activeModel,
    embedder: createMlEmbedder({ ...service, expectedModel: activeModel }),
    describe: {
      kind: 'ml',
      model: activeModel,
      note: `${activeModel} qua dịch vụ ml (model hoạt động lấy từ DB)`,
    },
  };
}

const DEFAULT_RESOLVER_TTL_MS = 15_000;

export type ActiveEmbeddingState = { activeModel: string | null; revision: number };
export type EmbeddingResolution = { config: EmbeddingConfig; revision: number | null };

/**
 * Bộ phân giải dùng lại giữa các lượt: đọc trạng thái embedding từ DB qua `readState` rồi nhớ `ttlMs` (đổi model là việc hiếm; sai lệch ngắn hạn
 * vẫn an toàn vì mọi câu tìm còn lọc từng dòng `embedding_model = model hoạt động`). Lỗi đọc DB → ném lên (nơi gọi suy giảm về toàn văn).
 */
export function createEmbeddingResolver(input: {
  service: MlEmbedderOptions | undefined;
  ttlMs?: number;
  now?: () => number;
}) {
  const ttlMs = input.ttlMs ?? DEFAULT_RESOLVER_TTL_MS;
  const now = input.now ?? Date.now;
  let cached: { at: number; resolution: EmbeddingResolution } | undefined;
  return {
    async resolve(readState: () => Promise<ActiveEmbeddingState>): Promise<EmbeddingResolution> {
      if (!input.service)
        return { config: resolveEmbeddingConfig(undefined, null), revision: null };
      if (cached && now() - cached.at < ttlMs) return cached.resolution;
      const state = await readState();
      const resolution = {
        config: resolveEmbeddingConfig(input.service, state.activeModel),
        revision: state.revision,
      };
      cached = { at: now(), resolution };
      return resolution;
    },
  };
}
