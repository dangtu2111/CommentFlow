import type { ChunkDraft } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  buildChunkRows,
  contentHash,
  createMockEmbedder,
  EMBEDDING_DIMENSIONS,
  type Embedder,
  embedInBatches,
  planChunkIndexing,
} from './kb-indexing';

const draft = (key: string, content: string, over: Partial<ChunkDraft> = {}): ChunkDraft => ({
  chunkKey: key,
  content,
  contextHeader: 'FAQ › Ship',
  lang: 'vi',
  productId: null,
  validFrom: null,
  validUntil: null,
  ...over,
});

describe('FR-055 content_hash', () => {
  it('ổn định, dạng sha256 hex', () => {
    const hash = contentHash(draft('k#0', 'Miễn phí ship'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash(draft('k#0', 'Miễn phí ship'))).toBe(hash);
  });

  it('đổi khi đổi nội dung, header hoặc ngôn ngữ (embedding phụ thuộc cả ba) — FR-130', () => {
    const hash = contentHash(draft('k#0', 'A'));
    expect(contentHash(draft('k#0', 'B'))).not.toBe(hash);
    expect(contentHash(draft('k#0', 'A', { contextHeader: 'FAQ › Đổi trả' }))).not.toBe(hash);
    expect(contentHash(draft('k#0', 'A', { contextHeader: null }))).not.toBe(hash);
    expect(contentHash(draft('k#0', 'A', { lang: 'en' }))).not.toBe(hash);
  });

  it('không đổi khi chỉ đổi chunk_key, hạn hiệu lực hoặc sản phẩm (không ảnh hưởng embedding)', () => {
    const hash = contentHash(draft('k#0', 'A'));
    expect(contentHash(draft('k#9', 'A', { validUntil: new Date(), productId: 'p' }))).toBe(hash);
  });
});

describe('FR-055 mock embedder + theo lô', () => {
  it('xác định, đúng 1024 chiều, đã chuẩn hóa, không gọi mạng', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const embedder = createMockEmbedder();
    const [a1, b] = await embedder.embed(['a', 'b']);
    const [a2] = await embedder.embed(['a']);
    expect(a1).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
    const norm = Math.sqrt((a1 as number[]).reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('tên mô hình mặc định và tùy chọn', () => {
    expect(createMockEmbedder().model).toBe('mock-embed-v1');
    expect(createMockEmbedder('m2').model).toBe('m2');
  });

  it('chia lô đúng kích thước và giữ thứ tự kết quả', async () => {
    const calls: string[][] = [];
    const embedder: Embedder = {
      model: 'm',
      embed: async (texts) => {
        calls.push([...texts]);
        return texts.map((t) => Array.from({ length: EMBEDDING_DIMENSIONS }, () => t.length));
      },
    };
    const out = await embedInBatches(embedder, ['a', 'bb', 'ccc', 'dddd', 'eeeee'], 2);
    expect(calls).toEqual([['a', 'bb'], ['ccc', 'dddd'], ['eeeee']]);
    expect(out.map((v) => v[0])).toEqual([1, 2, 3, 4, 5]);
  });

  it('không có văn bản → không gọi embedder', async () => {
    const embed = vi.fn();
    expect(await embedInBatches({ model: 'm', embed }, [], 4)).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('kích thước lô mặc định áp dụng khi không truyền', async () => {
    const embedder = createMockEmbedder();
    const spy = vi.spyOn(embedder, 'embed');
    await embedInBatches(
      embedder,
      Array.from({ length: 65 }, (_, i) => `t${i}`),
    );
    expect(spy.mock.calls.map((c) => c[0].length)).toEqual([64, 1]);
  });

  it('số vector trả về sai → lỗi INTERNAL', async () => {
    const bad: Embedder = { model: 'm', embed: async () => [] };
    await expect(embedInBatches(bad, ['a'], 4)).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('vector sai số chiều → lỗi INTERNAL', async () => {
    const bad: Embedder = { model: 'm', embed: async (texts) => texts.map(() => [1, 2, 3]) };
    await expect(embedInBatches(bad, ['a'], 4)).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('kích thước lô không hợp lệ → lỗi', async () => {
    await expect(embedInBatches(createMockEmbedder(), ['a'], 0)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('FR-055 planChunkIndexing: bỏ qua phần không đổi', () => {
  const model = 'mock-embed-v1';
  const a = draft('d#0', 'A');
  const b = draft('d#1', 'B');
  const existing = (d: ChunkDraft, embeddingModel: string | null = model) => ({
    chunkKey: d.chunkKey,
    contentHash: contentHash(d),
    embeddingModel,
  });

  it('lần đầu: embed tất cả, không xóa gì', () => {
    const plan = planChunkIndexing({ drafts: [a, b], existing: [], model });
    expect(plan.toEmbed.map((c) => c.chunkKey)).toEqual(['d#0', 'd#1']);
    expect(plan.toEmbed[0]?.contentHash).toBe(contentHash(a));
    expect(plan.unchangedKeys).toEqual([]);
    expect(plan.removedKeys).toEqual([]);
  });

  it('không đổi gì → không embed lại', () => {
    const plan = planChunkIndexing({ drafts: [a, b], existing: [existing(a), existing(b)], model });
    expect(plan.toEmbed).toEqual([]);
    expect(plan.unchangedKeys).toEqual(['d#0', 'd#1']);
    expect(plan.removedKeys).toEqual([]);
  });

  it('chỉ embed đoạn đổi nội dung; đoạn không còn trong bản mới bị báo xóa', () => {
    const changed = draft('d#0', 'A đã sửa');
    const plan = planChunkIndexing({
      drafts: [changed],
      existing: [existing(a), existing(b)],
      model,
    });
    expect(plan.toEmbed.map((c) => c.chunkKey)).toEqual(['d#0']);
    expect(plan.unchangedKeys).toEqual([]);
    expect(plan.removedKeys).toEqual(['d#1']);
  });

  it('đổi mô hình embedding (hoặc chưa có mô hình) → embed lại dù hash giống (FR-133)', () => {
    const plan = planChunkIndexing({
      drafts: [a, b],
      existing: [existing(a, 'model-cu'), existing(b, null)],
      model,
    });
    expect(plan.toEmbed.map((c) => c.chunkKey)).toEqual(['d#0', 'd#1']);
  });

  it('trùng chunk_key trong đầu vào → lỗi VALIDATION_FAILED', () => {
    expect(() =>
      planChunkIndexing({ drafts: [a, draft('d#0', 'Z')], existing: [], model }),
    ).toThrow(/d#0/);
  });
});

describe('FR-055 buildChunkRows', () => {
  it('chỉ gọi embedder cho đoạn mới/đổi, trả hàng có hash + embedding + mô hình', async () => {
    const embedder = createMockEmbedder();
    const embed = vi.spyOn(embedder, 'embed');
    const a = draft('d#0', 'A');
    const b = draft('d#1', 'B');
    const result = await buildChunkRows({
      drafts: [a, draft('d#1', 'B mới')],
      existing: [
        { chunkKey: 'd#0', contentHash: contentHash(a), embeddingModel: embedder.model },
        { chunkKey: 'd#1', contentHash: contentHash(b), embeddingModel: embedder.model },
        { chunkKey: 'd#2', contentHash: 'x', embeddingModel: embedder.model },
      ],
      embedder,
    });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0]?.[0]).toEqual(['FAQ › Ship\nB mới']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      chunkKey: 'd#1',
      embeddingModel: 'mock-embed-v1',
      contentHash: contentHash(draft('d#1', 'B mới')),
    });
    expect(result.rows[0]?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(result.unchangedKeys).toEqual(['d#0']);
    expect(result.unchanged).toEqual([a]);
    expect(result.removedKeys).toEqual(['d#2']);
  });

  it('không có gì đổi → không gọi embedder', async () => {
    const embedder = createMockEmbedder();
    const embed = vi.spyOn(embedder, 'embed');
    const a = draft('d#0', 'A');
    const result = await buildChunkRows({
      drafts: [a],
      existing: [{ chunkKey: 'd#0', contentHash: contentHash(a), embeddingModel: embedder.model }],
      embedder,
      batchSize: 8,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(result.rows).toEqual([]);
  });
});

describe('buildChunkRows — không có embedder (chưa kích hoạt model / dịch vụ tắt)', () => {
  it('không tạo vector giả: embedding/model = null, đoạn vẫn có hash để tìm toàn văn', async () => {
    const result = await buildChunkRows({
      drafts: [
        {
          chunkKey: 'k#0',
          content: 'Đổi trả trong 7 ngày',
          contextHeader: null,
          lang: 'vi',
          productId: null,
          validFrom: null,
          validUntil: null,
        },
      ],
      existing: [],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ embedding: null, embeddingModel: null });
    expect(result.rows[0]?.contentHash).toBeTruthy();
  });
});
