import type { Database, KbVersionRef } from '@flow/db/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Embedder } from '../embedding/embedder';
import type { KbSearchQuery } from '../retrieve/kb-searcher';
import type { TryKnowledge } from './try-pipeline';
import { loadWorkspaceKnowledge, type WorkspaceKnowledgeReaders } from './workspace-knowledge';

/** Chặn lệch model embedding (FR-133): lệch → TẮT nhánh vector, không bao giờ trộn vector khác model; khớp → dùng. */

const searched: KbSearchQuery[] = [];
vi.mock('../retrieve/kb-searcher', () => ({
  createDbKbSearcher: () => async (q: KbSearchQuery) => {
    searched.push(q);
    return [];
  },
}));

const WS = '11111111-1111-4111-8111-111111111111';
const version: KbVersionRef = { id: '22222222-2222-4222-8222-222222222222', number: 1 };
const base: TryKnowledge = {
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  searchKb: async () => [],
};
const embed = vi.fn(async (texts: readonly string[]) => texts.map(() => [1, 0]));
const embedder: Embedder = { model: 'bge-m3', dimensions: 1024, embed } as unknown as Embedder;

const readers = (
  chunks: Array<{ model: string; count: number }>,
  products: Array<{ model: string; count: number }> = [],
): Partial<WorkspaceKnowledgeReaders> => ({
  countProducts: async () => 0,
  productNames: async () => [],
  shopTexts: async () => [],
  abbreviations: async () => ({}),
  brandVoices: async () => [],
  embeddingCounts: async () => ({ chunks, products }),
});

const load = (r: Partial<WorkspaceKnowledgeReaders>, withEmbedder = true) =>
  loadWorkspaceKnowledge({
    tx: {} as Database,
    workspaceId: WS,
    version,
    productsEnabled: true,
    base,
    ...(withEmbedder ? { embedder } : {}),
    readers: r,
  });

beforeEach(() => {
  searched.length = 0;
  embed.mockClear();
});

describe('loadWorkspaceKnowledge — chặn lệch model embedding', () => {
  it('dữ liệu khớp model cấu hình → dùng nhánh vector (embed + queryVector + embeddingModel)', async () => {
    const out = await load(readers([{ model: 'bge-m3', count: 4 }]));
    expect(out?.embedding.state).toBe('ok');
    await out?.knowledge.searchKb('giá?', { lang: 'vi', productIds: [] } as never);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(searched[0]).toMatchObject({ queryVector: [1, 0], embeddingModel: 'bge-m3' });
  });

  it('đoạn kiến thức khác model → mismatch, KHÔNG embed, KHÔNG queryVector (chỉ toàn văn/trigram)', async () => {
    const out = await load(readers([{ model: 'fixture-trigram-1024', count: 9 }]));
    expect(out?.embedding.state).toBe('mismatch');
    expect(out?.embedding.mismatches).toEqual([
      { source: 'kb_chunks', model: 'fixture-trigram-1024', count: 9 },
    ]);
    await out?.knowledge.searchKb('giá?', { lang: 'vi', productIds: [] } as never);
    expect(embed).not.toHaveBeenCalled();
    expect(searched[0]?.queryVector).toBeUndefined();
    expect(searched[0]?.embeddingModel).toBeUndefined();
  });

  it('vector tên sản phẩm không rõ model → mismatch dù đoạn kiến thức khớp', async () => {
    const out = await load(readers([{ model: 'bge-m3', count: 4 }], [{ model: '', count: 40 }]));
    expect(out?.embedding.state).toBe('mismatch');
    expect(out?.embedding.mismatches[0]).toMatchObject({ source: 'products', count: 40 });
  });

  it('không có embedder (cấu hình off) → trạng thái off, không đọc DB đếm model, không embed', async () => {
    const embeddingCounts = vi.fn(async () => ({ chunks: [], products: [] }));
    const out = await load({ ...readers([]), embeddingCounts }, false);
    expect(out?.embedding.state).toBe('off');
    expect(embeddingCounts).not.toHaveBeenCalled();
    await out?.knowledge.searchKb('giá?', { lang: 'vi', productIds: [] } as never);
    expect(embed).not.toHaveBeenCalled();
  });

  it('chưa có vector nào (empty) → không lệch, vẫn dùng nhánh vector', async () => {
    const out = await load(readers([]));
    expect(out?.embedding.state).toBe('empty');
    await out?.knowledge.searchKb('giá?', { lang: 'vi', productIds: [] } as never);
    expect(embed).toHaveBeenCalledTimes(1);
  });
});
