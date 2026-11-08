import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RouteVariant } from '../route/sql-lookup';
import {
  DEFAULT_MAX_SOURCE_TOKENS,
  DEFAULT_MIN_RELEVANCE_RETRIEVE,
  estimateTokens,
  type KbHit,
  kbHitsToSources,
  MAX_RRF_SCORE,
  rrfRelevance,
  variantsToSources,
} from './sources';

/** Fixture đoạn kiến thức (không phải dữ liệu thật). */
function hit(over: Partial<KbHit> & { id: string }): KbHit {
  return {
    chunkKey: `key-${over.id}`,
    content: 'Nội dung đoạn',
    contextHeader: null,
    productId: null,
    score: MAX_RRF_SCORE,
    ...over,
  };
}

const VARIANT: RouteVariant = {
  id: 'v-1',
  productId: 'p-1',
  attrs: { size: 'm', color: 'black' },
  priceVnd: 250000,
  stock: 5,
};

describe('FR-028 rrfRelevance — điểm RRF → 0..1', () => {
  it('ba nhánh đều hạng 1 = 1; 0 → 0; vượt trần bị kẹp về 1', () => {
    expect(rrfRelevance(MAX_RRF_SCORE)).toBe(1);
    expect(rrfRelevance(0)).toBe(0);
    expect(rrfRelevance(MAX_RRF_SCORE * 2)).toBe(1);
  });

  it('điểm âm hoặc không phải số → 0', () => {
    expect(rrfRelevance(-1)).toBe(0);
    expect(rrfRelevance(Number.NaN)).toBe(0);
  });
});

describe('FR-028 variantsToSources — nguồn giá/tồn đọc từ DB (nguyên tắc #4)', () => {
  it('một biến thể → nguồn product, id variant:<id>, relevance 1, giá có dấu chấm nghìn', () => {
    const [source] = variantsToSources([VARIANT]);
    expect(source?.id).toBe('variant:v-1');
    expect(source?.kind).toBe('product');
    expect(source?.relevance).toBe(1);
    expect(source?.text).toContain('250.000đ');
    expect(source?.text).toContain('size m');
    expect(source?.text).toContain('color black');
    expect(source?.text).toContain('còn 5');
  });

  it('tồn 0 → hết hàng; tồn null → chưa rõ tồn; giá null → chưa có giá (không bịa số)', () => {
    const [soldOut, unknownStock, noPrice] = variantsToSources([
      { ...VARIANT, id: 'a', stock: 0 },
      { ...VARIANT, id: 'b', stock: null },
      { ...VARIANT, id: 'c', priceVnd: null, attrs: {}, stock: null },
    ]);
    expect(soldOut?.text).toContain('hết hàng');
    expect(unknownStock?.text).toContain('chưa rõ tồn kho');
    expect(noPrice?.text).toContain('chưa có giá');
    expect(noPrice?.text).not.toMatch(/\d/);
  });

  it('không biến thể → rỗng', () => {
    expect(variantsToSources([])).toEqual([]);
  });
});

describe('FR-028 kbHitsToSources — lọc ngưỡng, ưu tiên, cắt trần token', () => {
  const base = { productIds: [] as string[] };

  it('bỏ đoạn dưới ngưỡng liên quan; đúng ngưỡng thì giữ', () => {
    const atThreshold = MAX_RRF_SCORE * DEFAULT_MIN_RELEVANCE_RETRIEVE;
    const { sources } = kbHitsToSources(
      [hit({ id: 'keep', score: atThreshold }), hit({ id: 'drop', score: atThreshold * 0.99 })],
      base,
    );
    expect(sources.map((s) => s.id)).toEqual(['kb:keep']);
  });

  it('đoạn của sản phẩm gắn bài xếp trước kiến thức chung dù điểm thấp hơn', () => {
    const { sources } = kbHitsToSources(
      [
        hit({ id: 'general', score: MAX_RRF_SCORE }),
        hit({ id: 'product', productId: 'p-1', score: MAX_RRF_SCORE * 0.6 }),
      ],
      { productIds: ['p-1'] },
    );
    expect(sources.map((s) => s.id)).toEqual(['kb:product', 'kb:general']);
  });

  it('cùng nhóm → theo điểm giảm dần; hòa điểm giữ thứ tự đầu vào', () => {
    const { sources } = kbHitsToSources(
      [
        hit({ id: 'low', score: MAX_RRF_SCORE * 0.5 }),
        hit({ id: 'tie1', score: MAX_RRF_SCORE * 0.9 }),
        hit({ id: 'tie2', score: MAX_RRF_SCORE * 0.9 }),
      ],
      base,
    );
    expect(sources.map((s) => s.id)).toEqual(['kb:tie1', 'kb:tie2', 'kb:low']);
  });

  it('nội dung nguồn gồm tiêu đề ngữ cảnh (nếu có) và nội dung', () => {
    const { sources } = kbHitsToSources(
      [hit({ id: 'a', contextHeader: 'Đổi trả', content: '7 ngày' })],
      base,
    );
    expect(sources[0]?.text).toBe('Đổi trả\n7 ngày');
    expect(sources[0]?.kind).toBe('kb');
    expect(sources[0]?.relevance).toBe(1);
  });

  it('vượt trần token: bỏ đoạn không vừa, đánh dấu truncated, vẫn giữ đoạn nhỏ sau đó', () => {
    const big = 'x'.repeat(300); // 100 token
    const { sources, truncated } = kbHitsToSources(
      [
        hit({ id: 'first', content: big, score: MAX_RRF_SCORE }),
        hit({ id: 'huge', content: big.repeat(10), score: MAX_RRF_SCORE * 0.9 }),
        hit({ id: 'small', content: 'ngắn', score: MAX_RRF_SCORE * 0.8 }),
      ],
      { ...base, maxTokens: 150 },
    );
    expect(sources.map((s) => s.id)).toEqual(['kb:first', 'kb:small']);
    expect(truncated).toBe(true);
  });

  it('không vượt trần → truncated=false; mặc định trần 3.000 token', () => {
    expect(DEFAULT_MAX_SOURCE_TOKENS).toBe(3000);
    expect(kbHitsToSources([hit({ id: 'a' })], base).truncated).toBe(false);
  });

  it('không có hit → rỗng', () => {
    expect(kbHitsToSources([], base)).toEqual({ sources: [], truncated: false, quarantined: [] });
  });
});

describe('FR-028 estimateTokens', () => {
  it('ước lượng bảo thủ ký tự/3 làm tròn lên; rỗng → 0', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(2);
  });
});

describe('FR-028 kbHitsToSources — property-based', () => {
  const hitArb = fc.record({
    id: fc.uuid(),
    chunkKey: fc.string(),
    content: fc.string({ maxLength: 600 }),
    contextHeader: fc.option(fc.string({ maxLength: 40 }), { nil: null }),
    productId: fc.option(fc.constantFrom('p-1', 'p-2'), { nil: null }),
    score: fc.double({ min: 0, max: 0.2, noNaN: true }),
  });

  it('tổng token nguồn ≤ trần; relevance ∈ [ngưỡng,1]', () => {
    fc.assert(
      fc.property(
        fc.array(hitArb, { maxLength: 15 }),
        fc.integer({ min: 1, max: 400 }),
        (hits, cap) => {
          const { sources } = kbHitsToSources(hits, { productIds: ['p-1'], maxTokens: cap });
          const total = sources.reduce((sum, s) => sum + estimateTokens(s.text), 0);
          expect(total).toBeLessThanOrEqual(cap);
          for (const s of sources) {
            expect(s.relevance).toBeGreaterThanOrEqual(DEFAULT_MIN_RELEVANCE_RETRIEVE);
            expect(s.relevance).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });
});

describe('kbRelevanceFromCosine — điểm liên quan TUYỆT ĐỐI cho đoạn kiến thức (không dùng ngưỡng trên RRF)', () => {
  it('đúng ngưỡng cosine = đúng ngưỡng liên quan chung (DEFAULT_MIN_RELEVANCE); trên ngưỡng thì qua, dưới thì rớt', async () => {
    const { kbRelevanceFromCosine, KB_MIN_COSINE } = await import('./sources');
    const { DEFAULT_MIN_RELEVANCE } = await import('../draft/drafter');
    expect(kbRelevanceFromCosine(KB_MIN_COSINE)).toBeCloseTo(DEFAULT_MIN_RELEVANCE, 10);
    expect(kbRelevanceFromCosine(KB_MIN_COSINE + 0.2)).toBeGreaterThan(DEFAULT_MIN_RELEVANCE);
    expect(kbRelevanceFromCosine(KB_MIN_COSINE - 0.05)).toBeLessThan(DEFAULT_MIN_RELEVANCE);
  });

  it('đơn điệu theo cosine và kẹp trong 0..1', async () => {
    const { kbRelevanceFromCosine } = await import('./sources');
    expect(kbRelevanceFromCosine(0.9)).toBeGreaterThan(kbRelevanceFromCosine(0.5));
    expect(kbRelevanceFromCosine(-0.5)).toBe(0);
    expect(kbRelevanceFromCosine(5)).toBe(1);
  });
});
