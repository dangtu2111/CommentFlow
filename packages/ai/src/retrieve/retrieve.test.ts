import type { CommentLabel } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createFixtureEmbedder } from '../embedding/fixture-embedder';
import type { RouteExtract } from '../route/route';
import type { RouteVariant } from '../route/sql-lookup';
import { type RetrieveDeps, type RetrieveInput, retrieveKnowledge } from './retrieve';
import { type KbHit, MAX_RRF_SCORE } from './sources';

/** Fixture extract tối thiểu (không phải dữ liệu khách thật). */
function extract(
  labels: CommentLabel[] = ['price'],
  over: Partial<RouteExtract> = {},
): RouteExtract {
  return {
    labels: labels.map((label, i) => ({ label, confidence: 0.9 - i * 0.1 })),
    size: null,
    color: null,
    asks: [],
    order_intent: null,
    ...over,
  };
}

const VARIANT: RouteVariant = {
  id: 'v-1',
  productId: 'p-1',
  attrs: { size: 'm' },
  priceVnd: 250000,
  stock: 2,
};
const HIT: KbHit = {
  id: 'c-1',
  chunkKey: 'k-1',
  content: 'Đổi trả trong 7 ngày',
  contextHeader: 'Đổi trả',
  productId: null,
  score: MAX_RRF_SCORE,
};

function setup(over: Partial<RetrieveDeps> = {}) {
  const embedder = createFixtureEmbedder();
  const embed = vi.spyOn(embedder, 'embed');
  const lookupVariants = vi.fn(async () => [VARIANT]);
  const searchKb = vi.fn(async (_query: Parameters<RetrieveDeps['searchKb']>[0]) => [HIT]);
  const deps: RetrieveDeps = { embedder, lookupVariants, searchKb, ...over };
  return { deps, embed, lookupVariants, searchKb };
}

function input(over: Partial<RetrieveInput> = {}): RetrieveInput {
  return {
    extract: extract(),
    searchQuery: 'giá áo thun',
    lang: 'vi',
    resolvedProductIds: ['p-1'],
    ...over,
  };
}

async function retrieved(d: ReturnType<typeof setup>, over: Partial<RetrieveInput> = {}) {
  const result = await retrieveKnowledge(d.deps, input(over));
  if (result.status !== 'retrieved') throw new Error('phải retrieved');
  return result;
}

describe('FR-028 retrieveKnowledge — nhãn không cần trả lời', () => {
  it.each([
    [['complaint']],
    [['price', 'complaint']],
    [['complaint', 'advice']],
  ] as CommentLabel[][][])(
    'Khiếu nại ở bất kỳ vị trí nào (%j) → skipped, không gọi gì (FR-145)',
    async (labels) => {
      const d = setup();
      const result = await retrieveKnowledge(d.deps, input({ extract: extract(labels) }));
      expect(result).toEqual({ status: 'skipped', reason: 'complaint' });
      expect(d.embed).not.toHaveBeenCalled();
      expect(d.lookupVariants).not.toHaveBeenCalled();
      expect(d.searchKb).not.toHaveBeenCalled();
    },
  );

  it('spam là nhãn chính → skipped; spam chỉ là nhãn phụ → vẫn tìm', async () => {
    const d = setup();
    expect(await retrieveKnowledge(d.deps, input({ extract: extract(['spam', 'price']) }))).toEqual(
      { status: 'skipped', reason: 'spam' },
    );
    expect(d.searchKb).not.toHaveBeenCalled();
    const result = await retrieveKnowledge(d.deps, input({ extract: extract(['price', 'spam']) }));
    expect(result.status).toBe('retrieved');
  });
});

describe('FR-028/136 retrieveKnowledge — chạy theo nhánh route', () => {
  it('sql: chỉ tra biến thể; KHÔNG gọi embedder/tìm kiến thức; nguồn là biến thể', async () => {
    const d = setup();
    const result = await retrieved(d);
    expect(result.route).toBe('sql');
    expect(result.reason).toBe('sql_product_fact');
    expect(d.lookupVariants).toHaveBeenCalledTimes(1);
    expect(d.embed).not.toHaveBeenCalled();
    expect(d.searchKb).not.toHaveBeenCalled();
    expect(result.sources.map((s) => s.id)).toEqual(['variant:v-1']);
    expect(result.variants).toEqual([VARIANT]);
  });

  it('hybrid: chỉ tìm kiến thức với vector từ embedder, ngôn ngữ và sản phẩm của bài', async () => {
    const d = setup();
    const result = await retrieved(d, {
      extract: extract(['advice']),
      searchQuery: 'đổi trả thế nào',
      lang: 'en',
    });
    expect(result.route).toBe('hybrid');
    expect(d.lookupVariants).not.toHaveBeenCalled();
    expect(d.embed).toHaveBeenCalledWith(['đổi trả thế nào']);
    const call = d.searchKb.mock.calls[0]?.[0];
    expect(call?.queryText).toBe('đổi trả thế nào');
    expect(call?.lang).toBe('en');
    expect(call?.productIds).toEqual(['p-1']);
    expect(call?.queryVector).toHaveLength(1024);
    expect(result.sources.map((s) => s.id)).toEqual(['kb:c-1']);
    expect(result.variants).toEqual([]);
  });

  it('both chưa nhận sản phẩm: có tìm kiến thức, không tra DB biến thể', async () => {
    const d = setup();
    const result = await retrieved(d, { resolvedProductIds: [] });
    expect(result.route).toBe('both');
    expect(d.searchKb).toHaveBeenCalledTimes(1);
    expect(d.lookupVariants).not.toHaveBeenCalled();
    expect(result.sources.map((s) => s.id)).toEqual(['kb:c-1']);
  });

  it('both có sản phẩm + ý khác: biến thể trước, kiến thức sau', async () => {
    const d = setup();
    const result = await retrieved(d, {
      extract: extract(['price'], { asks: ['ship về Cà Mau'] }),
    });
    expect(result.route).toBe('both');
    expect(result.sources.map((s) => s.id)).toEqual(['variant:v-1', 'kb:c-1']);
  });

  it('không tìm thấy gì → retrieved với nguồn rỗng (decideAction sẽ chuyển hướng)', async () => {
    const d = setup({ searchKb: vi.fn(async () => []) });
    const result = await retrieved(d, { extract: extract(['advice']) });
    expect(result).toMatchObject({ route: 'hybrid', sources: [], variants: [] });
  });

  it('truncated của nguồn kiến thức được chuyển lên kết quả', async () => {
    const hits: KbHit[] = [
      { ...HIT, id: 'a', content: 'x'.repeat(300) },
      { ...HIT, id: 'b', content: 'y'.repeat(30000), score: MAX_RRF_SCORE * 0.9 },
    ];
    const d = setup({ searchKb: vi.fn(async () => hits) });
    const result = await retrieved(d, { extract: extract(['advice']), maxTokens: 150 });
    expect(result.truncated).toBe(true);
    expect(result.sources.map((s) => s.id)).toEqual(['kb:a']);
  });

  it('minRelevance tùy chỉnh được áp dụng', async () => {
    const d = setup({ searchKb: vi.fn(async () => [{ ...HIT, score: MAX_RRF_SCORE * 0.5 }]) });
    const result = await retrieved(d, { extract: extract(['advice']), minRelevance: 0.9 });
    expect(result.sources).toEqual([]);
  });
});

describe('FR-028 retrieveKnowledge — biên và lỗi', () => {
  it('câu tìm rỗng → không gọi embedder/tìm kiến thức', async () => {
    const d = setup();
    const result = await retrieved(d, { extract: extract(['advice']), searchQuery: '   ' });
    expect(result).toMatchObject({ route: 'hybrid', sources: [] });
    expect(d.embed).not.toHaveBeenCalled();
    expect(d.searchKb).not.toHaveBeenCalled();
  });

  it('lỗi embedder/tìm/tra DB được ném ra, không nuốt', async () => {
    const boom = new Error('boom');
    const advice = input({ extract: extract(['advice']) });
    const e1 = setup();
    e1.deps.embedder.embed = async () => {
      throw boom;
    };
    await expect(retrieveKnowledge(e1.deps, advice)).rejects.toBe(boom);
    const e2 = setup({ searchKb: vi.fn(async () => Promise.reject(boom)) });
    await expect(retrieveKnowledge(e2.deps, advice)).rejects.toBe(boom);
    const e3 = setup({ lookupVariants: vi.fn(async () => Promise.reject(boom)) });
    await expect(retrieveKnowledge(e3.deps, input())).rejects.toBe(boom);
  });

  it('embedder trả số vector sai → ném LLM_UNAVAILABLE, không tìm bằng vector hỏng', async () => {
    const d = setup();
    d.deps.embedder.embed = async () => [];
    await expect(
      retrieveKnowledge(d.deps, input({ extract: extract(['advice']) })),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(d.searchKb).not.toHaveBeenCalled();
  });
});

describe('FR-028/136 retrieveKnowledge — property-based', () => {
  const labelsArb = fc.subarray(
    ['price', 'advice', 'purchase', 'complaint', 'spam', 'other'] as CommentLabel[],
    { minLength: 1 },
  );

  it('complaint ⇒ skipped; nhánh sql ⇒ không có nguồn kiến thức và không tìm kiến thức', async () => {
    await fc.assert(
      fc.asyncProperty(
        labelsArb,
        fc.array(fc.constantFrom('p-1', 'p-2'), { maxLength: 2 }),
        async (labels, ids) => {
          const d = setup();
          const result = await retrieveKnowledge(
            d.deps,
            input({ extract: extract(labels), resolvedProductIds: ids }),
          );
          if (labels.includes('complaint')) {
            expect(result.status).toBe('skipped');
            return;
          }
          if (result.status === 'retrieved' && result.route === 'sql') {
            expect(result.sources.every((s) => !s.id.startsWith('kb:'))).toBe(true);
            expect(d.searchKb).not.toHaveBeenCalled();
          }
        },
      ),
    );
  });
});
