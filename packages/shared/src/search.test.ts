import { describe, expect, it } from 'vitest';
import {
  adjustByDistinctiveTokens,
  distinctiveTokens,
  hybridProductScores,
  isProductCacheStale,
  normalizeSearchText,
  PRODUCT_MATCH_THRESHOLD,
  PRODUCT_MIN_COSINE,
  pickProductMatch,
  productScoreFromCosine,
  productSearchText,
  RRF_K,
  reciprocalRankFusion,
} from './search';

describe('FR-127 normalizeSearchText (chuẩn hóa chuỗi tìm kiếm)', () => {
  it('thường, bỏ dấu kể cả đ, bỏ dấu câu, gộp khoảng trắng', () => {
    expect(normalizeSearchText('  Áo LEN,  Đỏ!! ')).toBe('ao len do');
    expect(normalizeSearchText('Đầm Xòe (Size-M)')).toBe('dam xoe size m');
  });
  it('rỗng hoặc chỉ dấu câu → chuỗi rỗng', () => {
    expect(normalizeSearchText('')).toBe('');
    expect(normalizeSearchText('?!…')).toBe('');
  });
  it('giữ chữ số và chữ latin; lũy đẳng', () => {
    const once = normalizeSearchText('Áo thun 100% cotton, SKU: AT-01');
    expect(once).toBe('ao thun 100 cotton sku at 01');
    expect(normalizeSearchText(once)).toBe(once);
  });
});

describe('FR-127 productSearchText (search_text của sản phẩm)', () => {
  it('gồm tên, SKU, thuộc tính biến thể, bí danh; không có giá/tồn; bỏ trùng từ', () => {
    const text = productSearchText({
      name: 'Áo len Cổ Tròn',
      sku: 'AL-01',
      variants: [{ attrs: { size: 'M', color: 'Đỏ' } }, { attrs: { size: 'M' } }],
      aliases: ['áo len'],
    });
    expect(text).toBe('ao len co tron al 01 size m color do');
  });
  it('thiếu SKU/biến thể/bí danh vẫn chạy', () => {
    expect(productSearchText({ name: 'Mũ' })).toBe('mu');
  });
});

describe('FR-057 reciprocalRankFusion (RRF k=60)', () => {
  it('đúng công thức Σ 1/(k+rank), xếp giảm dần', () => {
    expect(RRF_K).toBe(60);
    const fused = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['b', 'a'],
    ]);
    expect(fused.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(fused[0]?.score).toBeCloseTo(1 / 61 + 1 / 62, 10);
    expect(fused[1]?.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(fused[2]?.score).toBeCloseTo(1 / 63, 10);
  });
  it('hòa điểm giữ thứ tự xuất hiện đầu tiên (ổn định); rỗng → rỗng', () => {
    expect(reciprocalRankFusion([['x'], ['y']]).map((r) => r.id)).toEqual(['x', 'y']);
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
  it('trùng id trong cùng một danh sách chỉ tính lần đầu; k tùy chỉnh', () => {
    const fused = reciprocalRankFusion([['a', 'a', 'b']], 10);
    expect(fused[0]?.score).toBeCloseTo(1 / 11, 10);
    expect(fused[1]?.score).toBeCloseTo(1 / 12, 10); // bản trùng không chiếm hạng
  });
});

describe('FR-127/128 pickProductMatch (dưới ngưỡng thì không chọn)', () => {
  it('chọn khi đủ ngưỡng và hơn hạng hai đủ biên', () => {
    const r = pickProductMatch([
      { id: 'p1', score: 0.8 },
      { id: 'p2', score: 0.5 },
    ]);
    expect(r).toEqual({ status: 'matched', id: 'p1', score: 0.8 });
  });
  it('một ứng viên đủ ngưỡng → chọn', () => {
    expect(pickProductMatch([{ id: 'p1', score: 0.45 }]).status).toBe('matched');
  });
  it('điểm cao nhất dưới ngưỡng → không chọn', () => {
    expect(pickProductMatch([{ id: 'p1', score: 0.449 }])).toEqual({
      status: 'none',
      reason: 'below_threshold',
    });
  });
  it('không có ứng viên → không chọn', () => {
    expect(pickProductMatch([])).toEqual({ status: 'none', reason: 'no_candidates' });
  });
  it('hạng hai sát hạng một (< biên) → mơ hồ, trả ứng viên để hỏi lại', () => {
    const r = pickProductMatch([
      { id: 'p1', score: 0.7 },
      { id: 'p2', score: 0.66 },
      { id: 'p3', score: 0.1 },
    ]);
    expect(r).toEqual({ status: 'ambiguous', ids: ['p1', 'p2'] });
  });
  it('không phụ thuộc thứ tự đầu vào; tham số tùy chỉnh', () => {
    const a = pickProductMatch([
      { id: 'p2', score: 0.5 },
      { id: 'p1', score: 0.65 },
    ]);
    expect(a).toMatchObject({ status: 'matched', id: 'p1' });
    expect(
      pickProductMatch([{ id: 'p1', score: 0.3 }], { threshold: 0.3, margin: 0.05 }).status,
    ).toBe('matched');
  });
});

describe('FR-135 isProductCacheStale (cache không trả giá cũ)', () => {
  it('khớp hết → không trượt; rỗng ↔ rỗng → không trượt', () => {
    expect(isProductCacheStale({ a: 1, b: 4 }, { a: 1, b: 4 })).toBe(false);
    expect(isProductCacheStale({}, {})).toBe(false);
  });
  it('lệch rev một sản phẩm → trượt', () => {
    expect(isProductCacheStale({ a: 1, b: 4 }, { a: 1, b: 5 })).toBe(true);
  });
  it('sản phẩm đã dùng không còn (thiếu) → trượt', () => {
    expect(isProductCacheStale({ a: 1, b: 4 }, { a: 1 })).toBe(true);
  });
  it('current có thêm sản phẩm không dùng → không ảnh hưởng', () => {
    expect(isProductCacheStale({ a: 1 }, { a: 1, z: 9 })).toBe(false);
  });
});

describe('(1b) điểm sản phẩm LAI: trigram + vector tên (cosine)', () => {
  it('cosine dưới ngưỡng → 0; đúng ngưỡng → đúng ngưỡng chọn sản phẩm; cosine 1 → 1', () => {
    expect(productScoreFromCosine(PRODUCT_MIN_COSINE - 0.01)).toBe(0);
    expect(productScoreFromCosine(PRODUCT_MIN_COSINE)).toBeCloseTo(PRODUCT_MATCH_THRESHOLD, 10);
    expect(productScoreFromCosine(1)).toBeCloseTo(1, 10);
    expect(productScoreFromCosine(0.9)).toBeGreaterThan(productScoreFromCosine(0.8));
  });

  it('mỗi sản phẩm lấy điểm LỚN hơn của hai nhánh; chỉ-vector (trigram 0) vẫn có điểm', () => {
    const scores = hybridProductScores([
      { id: 'a', similarity: 0.7, cosine: 0.5 },
      { id: 'b', similarity: 0, cosine: 0.9 },
      { id: 'c', similarity: 0.2, cosine: null },
      { id: 'd', similarity: 0, cosine: 0.3 },
    ]);
    const byId = Object.fromEntries(scores.map((x) => [x.id, x.score]));
    expect(byId.a).toBe(0.7);
    expect(byId.b).toBeCloseTo(productScoreFromCosine(0.9), 10);
    expect(byId.c).toBe(0.2);
    expect(byId.d).toBe(0);
  });

  it('khách gõ lệch chữ ("áo sơ mi trắng" ↔ "Sơ mi nam màu trắng") — trigram thấp nhưng vector cao → được chọn; không đủ cả hai → không chọn', () => {
    const hit = pickProductMatch(
      hybridProductScores([{ id: 'p1', similarity: 0.12, cosine: 0.82 }]),
    );
    expect(hit).toMatchObject({ status: 'matched', id: 'p1' });
    const miss = pickProductMatch(
      hybridProductScores([{ id: 'p1', similarity: 0.12, cosine: 0.4 }]),
    );
    expect(miss.status).toBe('none');
  });
});

describe('(1b) token đặc trưng (size/mã/"2 in 1") ưu tiên khi xếp hạng sản phẩm', () => {
  it('nhận kích cỡ, chữ-số, "n in n" (mọi cách viết), bỏ từ thường', () => {
    expect(distinctiveTokens('xxxl litter box')).toEqual(['xxxl']);
    expect(distinctiveTokens('A4 Portable Printer')).toEqual(['a4']);
    expect(distinctiveTokens('2 in 1 shower')).toEqual(['2in1']);
    expect(distinctiveTokens('2 in1 Handheld Shower')).toEqual(['2in1']);
    expect(distinctiveTokens('14-in-1 foldable bench')).toEqual(['14in1']);
    expect(distinctiveTokens('áo thun size M màu đen')).toEqual(['m']);
    expect(distinctiveTokens('dog nail scratch board')).toEqual([]);
    expect(distinctiveTokens('SKU ab123 giá')).toEqual(['ab123']);
  });

  it('đủ token trong tên → cộng điểm (trần 1); thiếu → nhân hệ số giảm; không có token → giữ nguyên', () => {
    expect(
      adjustByDistinctiveTokens(0.5, 'xxxl litter box', 'XXXL Stainless Steel Litter Box'),
    ).toBeGreaterThan(0.5);
    expect(
      adjustByDistinctiveTokens(0.95, 'xxxl litter box', 'XXXL Litter Box'),
    ).toBeLessThanOrEqual(1);
    expect(
      adjustByDistinctiveTokens(0.5, 'xxxl litter box', 'Extra large automatic litter box'),
    ).toBeLessThan(0.5);
    expect(adjustByDistinctiveTokens(0.5, 'litter box', 'Stainless Steel Cat Litter Box')).toBe(
      0.5,
    );
    expect(adjustByDistinctiveTokens(0, 'xxxl box', 'XXXL Box')).toBe(0);
  });

  it('hybridProductScores nhận minCosine tùy chỉnh và tên + lời nhắc để áp token', () => {
    const hits = [
      { id: 'a', name: 'XXXL Stainless Steel Litter Box', similarity: 0.5, cosine: 0.7 },
      { id: 'b', name: 'Extra large automatic litter box', similarity: 0.5, cosine: 0.7 },
    ];
    const plain = hybridProductScores(hits);
    expect(plain[0]?.score).toBe(plain[1]?.score);
    const tokened = hybridProductScores(hits, { mention: 'xxxl litter box' });
    expect((tokened[0]?.score ?? 0) - (tokened[1]?.score ?? 0)).toBeGreaterThan(0.1);
    expect(
      hybridProductScores([{ id: 'c', name: 'x', similarity: 0, cosine: 0.7 }], {
        minCosine: 0.8,
      })[0]?.score,
    ).toBe(0);
    expect(
      hybridProductScores([{ id: 'c', name: 'x', similarity: 0, cosine: 0.7 }], {
        minCosine: 0.6,
      })[0]?.score,
    ).toBeGreaterThan(0.45);
  });
});
