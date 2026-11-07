import type { Database } from '@flow/db/runtime';
import { describe, expect, it, vi } from 'vitest';

const calls: Record<string, unknown[]> = {};
vi.mock('@flow/db/runtime', () => {
  const rec = (name: string, result: unknown) =>
    vi.fn(async (...args: unknown[]) => {
      calls[name] = args.slice(1);
      return result;
    });
  return {
    countActiveProducts: rec('count', 4),
    listTryProductNames: rec('names', ['A']),
    loadTryShopTexts: rec('texts', []),
    loadAbbreviationEntries: vi.fn(async (_tx: unknown, _ws: string, lang: string) =>
      lang === 'en' ? { sz: 'size', bn: 'how much' } : { bn: 'bao nhiêu' },
    ),
    listBrandVoices: rec('voices', []),
    countEmbeddingModels: rec('embeddingCounts', { chunks: [], products: [] }),
  };
});

import { defaultKnowledgeReaders, SAMPLE_LABEL } from './workspace-knowledge';

const tx = {} as Database;
const WS = '11111111-1111-4111-8111-111111111111';

describe('defaultKnowledgeReaders — đọc DB thật, loại nhãn mẫu [MẪU]', () => {
  it('đếm/tên/chính sách truyền nhãn mẫu để KHÔNG tính dữ liệu mẫu là thật', async () => {
    expect(await defaultKnowledgeReaders.countProducts(tx, WS)).toBe(4);
    expect(calls.count).toEqual([WS, SAMPLE_LABEL]);
    expect(await defaultKnowledgeReaders.productNames(tx, WS)).toEqual(['A']);
    expect(calls.names).toEqual([WS, SAMPLE_LABEL]);
    expect(await defaultKnowledgeReaders.shopTexts(tx, WS)).toEqual([]);
    expect(calls.texts).toEqual([WS, SAMPLE_LABEL]);
  });

  it('từ điển viết tắt gộp en rồi vi (vi thắng khi trùng); giọng văn đọc theo workspace', async () => {
    expect(await defaultKnowledgeReaders.abbreviations(tx, WS)).toEqual({
      sz: 'size',
      bn: 'bao nhiêu',
    });
    expect(await defaultKnowledgeReaders.brandVoices(tx, WS)).toEqual([]);
  });
});
