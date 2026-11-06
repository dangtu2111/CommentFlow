import { createHash } from 'node:crypto';
import { AppError, type ChunkDraft, indexText } from '@flow/shared';

/** Số chiều vector của `kb_chunks.embedding` (`halfvec(1024)`, FR-139). */
export const EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_BATCH_SIZE = 64;
const MOCK_MODEL = 'mock-embed-v1';

/**
 * Cổng tạo embedding. Bản thật (LiteLLM `/embeddings` + ghi `ai_usage`) cắm sau cùng interface này
 * (gap `KB-EMBED-LITELLM`); hiện chỉ có bản mock xác định, không gọi dịch vụ ngoài.
 */
export interface Embedder {
  /** Tên + revision mô hình, lưu vào `kb_chunks.embedding_model` (FR-133). */
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export type ExistingChunk = {
  chunkKey: string;
  contentHash: string;
  embeddingModel: string | null;
};

export type HashedDraft = ChunkDraft & { contentHash: string };
export type ChunkRow = HashedDraft & { embedding: number[]; embeddingModel: string };

export type IndexingPlan = {
  toEmbed: HashedDraft[];
  unchangedKeys: string[];
  removedKeys: string[];
};

/**
 * Dấu vân tay của thứ quyết định embedding: ngôn ngữ + `header + "\n" + content` (FR-130).
 * Đổi `chunk_key`, hạn hiệu lực hay sản phẩm KHÔNG đổi hash (không cần embed lại).
 */
export function contentHash(chunk: Pick<ChunkDraft, 'contextHeader' | 'content' | 'lang'>): string {
  return createHash('sha256').update(`${chunk.lang}\n${indexText(chunk)}`).digest('hex');
}

/** FNV-1a 32 bit → hạt giống cho bộ sinh số giả ngẫu nhiên của bản mock. */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash;
}

/** Bản mock: vector giả ngẫu nhiên nhưng xác định theo văn bản, chuẩn hóa độ dài 1. Chỉ cho test/dev. */
export function createMockEmbedder(model: string = MOCK_MODEL): Embedder {
  return {
    model,
    embed: async (texts) =>
      texts.map((text) => {
        let state = seedOf(text);
        const raw = Array.from({ length: EMBEDDING_DIMENSIONS }, () => {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          return state / 0xffffffff - 0.5;
        });
        const norm = Math.sqrt(raw.reduce((sum, x) => sum + x * x, 0));
        return raw.map((x) => x / norm);
      }),
  };
}

/** Embedding theo lô (FR-055); kiểm số vector và số chiều trả về để không ghi dữ liệu hỏng vào DB. */
export async function embedInBatches(
  embedder: Embedder,
  texts: string[],
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<number[][]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new AppError('VALIDATION_FAILED', 'Kích thước lô embedding phải là số nguyên ≥ 1.');
  }
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const result = await embedder.embed(batch);
    if (result.length !== batch.length) {
      throw new AppError('INTERNAL', 'Số vector embedding trả về không khớp số văn bản.');
    }
    for (const vector of result) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new AppError('INTERNAL', `Vector embedding phải có ${EMBEDDING_DIMENSIONS} chiều.`);
      }
      vectors.push(vector);
    }
  }
  return vectors;
}

/**
 * So đoạn mới với đoạn đã lưu (cùng nguồn): chỉ embed đoạn mới, đổi hash, hoặc đổi mô hình
 * embedding (FR-055, FR-133); đoạn đã lưu mà bản mới không còn → `removedKeys`.
 */
export function planChunkIndexing(input: {
  drafts: ChunkDraft[];
  existing: ExistingChunk[];
  model: string;
}): IndexingPlan {
  const known = new Map(input.existing.map((chunk) => [chunk.chunkKey, chunk]));
  const seen = new Set<string>();
  const toEmbed: HashedDraft[] = [];
  const unchangedKeys: string[] = [];
  for (const draft of input.drafts) {
    if (seen.has(draft.chunkKey)) {
      throw new AppError('VALIDATION_FAILED', `Trùng chunk_key: ${draft.chunkKey}.`);
    }
    seen.add(draft.chunkKey);
    const hash = contentHash(draft);
    const previous = known.get(draft.chunkKey);
    if (previous?.contentHash === hash && previous.embeddingModel === input.model) {
      unchangedKeys.push(draft.chunkKey);
    } else {
      toEmbed.push({ ...draft, contentHash: hash });
    }
  }
  const removedKeys = input.existing.map((c) => c.chunkKey).filter((key) => !seen.has(key));
  return { toEmbed, unchangedKeys, removedKeys };
}

/** Lập kế hoạch rồi embed theo lô phần cần embed → hàng sẵn sàng ghi bản nháp (`upsertDraftChunks`). */
export async function buildChunkRows(input: {
  drafts: ChunkDraft[];
  existing: ExistingChunk[];
  embedder: Embedder;
  batchSize?: number;
}): Promise<{ rows: ChunkRow[]; unchangedKeys: string[]; removedKeys: string[] }> {
  const plan = planChunkIndexing({
    drafts: input.drafts,
    existing: input.existing,
    model: input.embedder.model,
  });
  const vectors = await embedInBatches(
    input.embedder,
    plan.toEmbed.map((chunk) => indexText(chunk)),
    input.batchSize,
  );
  const rows = plan.toEmbed.map((chunk, i) => ({
    ...chunk,
    embedding: vectors[i] as number[],
    embeddingModel: input.embedder.model,
  }));
  return { rows, unchangedKeys: plan.unchangedKeys, removedKeys: plan.removedKeys };
}
