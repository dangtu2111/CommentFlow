import type { Database, KbVersionRef } from '@flow/db/runtime';
import { describe, expect, it, vi } from 'vitest';
import type { Embedder } from '../embedding/embedder';
import type { DbProductKnowledgeOptions } from './db-product-knowledge';
import type { TryKnowledge } from './try-pipeline';
import { loadWorkspaceKnowledge } from './workspace-knowledge';

/** (1b) Lớp sản phẩm nhận embedder (đã qua kiểm lệch model) và báo lỗi embedding về `vectorHealth`/`onEmbeddingFailure`. */
const captured: DbProductKnowledgeOptions[] = [];
vi.mock('./db-product-knowledge', () => ({
  createDbProductKnowledge: (_tx: unknown, _ws: string, options: DbProductKnowledgeOptions) => {
    captured.push(options);
    return {
      matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
      lookupProductFacts: async () => [],
      resolveProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
    };
  },
}));
vi.mock('../retrieve/kb-searcher', () => ({ createDbKbSearcher: () => async () => [] }));

const WS = '33333333-3333-4333-8333-333333333333';
const version: KbVersionRef = { id: '44444444-4444-4444-8444-444444444444', number: 1 };
const base: TryKnowledge = {
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  searchKb: async () => [],
};
const embedder = { model: 'bge-m3', dimensions: 1024, embed: vi.fn() } as unknown as Embedder;
const readers = {
  countProducts: async () => 3,
  productNames: async () => [],
  shopTexts: async () => [],
  abbreviations: async () => ({}),
  brandVoices: async () => [],
  embeddingCounts: async () => ({
    chunks: [{ model: 'bge-m3', count: 2 }],
    products: [{ model: 'bge-m3', count: 3 }],
  }),
};

describe('loadWorkspaceKnowledge — vector tên sản phẩm (1b)', () => {
  it('đưa embedder vào lớp sản phẩm; lỗi embedding ở đó → vectorHealth.failed + onEmbeddingFailure', async () => {
    const onEmbeddingFailure = vi.fn();
    const out = await loadWorkspaceKnowledge({
      tx: {} as Database,
      workspaceId: WS,
      version,
      productsEnabled: true,
      base,
      embedder,
      onEmbeddingFailure,
      readers,
    });
    const options = captured.at(-1);
    expect(options?.embedder).toBe(embedder);
    expect(out?.vectorHealth.failed).toBe(false);
    options?.onEmbeddingFailure?.(new Error('ml down'));
    expect(out?.vectorHealth.failed).toBe(true);
    expect(onEmbeddingFailure).toHaveBeenCalledTimes(1);
  });
});
