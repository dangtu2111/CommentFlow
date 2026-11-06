import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideAction } from '../decide/decide-action';
import {
  buildPriceQuote,
  checkCaptionPrices,
  checkCustomerQuotedPrice,
  evaluatePriceRisk,
  extractPriceAmounts,
} from './price-rules';

const SEED = { seed: 150158, numRuns: 200 };

describe('FR-150 extractPriceAmounts — số tiền trong văn bản', () => {
  it('rút số tiền đủ dạng, duy nhất, tăng dần; bỏ %, SĐT, số trần', () => {
    expect(extractPriceAmounts('Áo 199k, combo 2 cái 350.000đ, giảm 20%, ib 0912345678')).toEqual([
      199_000, 350_000,
    ]);
  });
  it('văn bản rỗng / không có tiền → []', () => {
    expect(extractPriceAmounts('')).toEqual([]);
    expect(extractPriceAmounts('còn 2 cái size M')).toEqual([]);
  });
  it('cùng số viết hai cách chỉ tính một lần', () => {
    expect(extractPriceAmounts('199k hay 199.000đ')).toEqual([199_000]);
  });
});

describe('FR-150a checkCaptionPrices — giá quảng cáo ↔ kho', () => {
  it('mọi số tiền trong caption có trong kho → matches, không xung đột', () => {
    const r = checkCaptionPrices({
      captionText: 'Áo thun 199k',
      stockPricesVnd: [199_000, 249_000],
    });
    expect(r.status).toBe('matches');
    expect(r.conflict).toBe(false);
    expect(r.mentions).toEqual([
      { amountVnd: 199_000, stockAmountVnd: 199_000, matchesStock: true },
    ]);
  });
  it('caption 199k nhưng kho 249k → conflict kèm hai con số (US-108)', () => {
    const r = checkCaptionPrices({ captionText: 'Chỉ 199k!', stockPricesVnd: [249_000] });
    expect(r).toMatchObject({ status: 'conflict', conflict: true });
    expect(r.mentions).toEqual([
      { amountVnd: 199_000, stockAmountVnd: 249_000, matchesStock: false },
    ]);
  });
  it('số kho gần nhất được báo; hòa khoảng cách → số nhỏ hơn', () => {
    const r = checkCaptionPrices({
      captionText: '200k',
      stockPricesVnd: [250_000, 150_000, 190_000],
    });
    expect(r.mentions[0]?.stockAmountVnd).toBe(190_000);
    const tie = checkCaptionPrices({ captionText: '200k', stockPricesVnd: [250_000, 150_000] });
    expect(tie.mentions[0]?.stockAmountVnd).toBe(150_000);
  });
  it('một số khớp, một số lệch → vẫn conflict', () => {
    const r = checkCaptionPrices({ captionText: '199k hoặc 299k', stockPricesVnd: [199_000] });
    expect(r.conflict).toBe(true);
    expect(r.mentions.map((m) => m.matchesStock)).toEqual([true, false]);
  });
  it('caption không có số tiền → no_amount, không xung đột', () => {
    expect(
      checkCaptionPrices({ captionText: 'Hàng mới về', stockPricesVnd: [199_000] }),
    ).toMatchObject({
      status: 'no_amount',
      conflict: false,
      mentions: [],
    });
  });
  it('kho chưa có giá (rỗng/không hợp lệ) → not_comparable, không tự kết luận xung đột', () => {
    for (const stock of [[], [0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
      const r = checkCaptionPrices({ captionText: '199k', stockPricesVnd: stock });
      expect(r).toMatchObject({ status: 'not_comparable', conflict: false });
      expect(r.mentions).toEqual([
        { amountVnd: 199_000, stockAmountVnd: null, matchesStock: false },
      ]);
    }
  });
  it('giá kho không nguyên (lẻ) được làm tròn khi so', () => {
    expect(checkCaptionPrices({ captionText: '199k', stockPricesVnd: [199_000.4] }).conflict).toBe(
      false,
    );
  });
});

describe('FR-150b checkCustomerQuotedPrice — khách nhắc giá khác giá hiện tại', () => {
  it('"hôm qua shop báo 199k" mà kho 249k → conflict, danh sách giá khách nhắc', () => {
    const r = checkCustomerQuotedPrice({
      commentText: 'hôm qua shop báo 199k mà',
      stockPricesVnd: [249_000],
    });
    expect(r).toMatchObject({ status: 'conflict', conflict: true, quotedVnd: [199_000] });
  });
  it('khách nhắc đúng giá kho → matches, không xung đột', () => {
    const r = checkCustomerQuotedPrice({
      commentText: 'giá 249k đúng không',
      stockPricesVnd: [249_000],
    });
    expect(r).toMatchObject({ status: 'matches', conflict: false });
  });
  it('khách không nhắc số tiền → no_amount', () => {
    expect(
      checkCustomerQuotedPrice({ commentText: 'còn size M không', stockPricesVnd: [249_000] }),
    ).toMatchObject({ status: 'no_amount', conflict: false, quotedVnd: [] });
  });
  it('kho chưa có giá → not_comparable (không chặn; câu giá sẽ chưa có nguồn)', () => {
    expect(checkCustomerQuotedPrice({ commentText: 'báo 199k', stockPricesVnd: [] })).toMatchObject(
      {
        status: 'not_comparable',
        conflict: false,
      },
    );
  });
});

describe('FR-150 evaluatePriceRisk — cờ cho decideAction + cảnh báo Owner', () => {
  const stock = [249_000];
  it('không có kiểm tra nào xung đột → priceConflict false, không cảnh báo', () => {
    expect(evaluatePriceRisk({})).toEqual({ priceConflict: false, source: null, ownerAlert: null });
    const caption = checkCaptionPrices({ captionText: '249k', stockPricesVnd: stock });
    expect(evaluatePriceRisk({ caption })).toMatchObject({
      priceConflict: false,
      ownerAlert: null,
    });
  });
  it('xung đột caption → source caption, cảnh báo "Giá quảng cáo khác giá kho" kèm hai con số', () => {
    const caption = checkCaptionPrices({ captionText: '199k', stockPricesVnd: stock });
    expect(evaluatePriceRisk({ caption })).toEqual({
      priceConflict: true,
      source: 'caption',
      ownerAlert: { kind: 'ad_price_mismatch', adAmountVnd: 199_000, stockAmountVnd: 249_000 },
    });
  });
  it('xung đột do khách nhắc → source customer, không có cảnh báo Owner (lý do "Khách nhắc giá khác")', () => {
    const customer = checkCustomerQuotedPrice({ commentText: 'báo 199k', stockPricesVnd: stock });
    expect(evaluatePriceRisk({ customer })).toEqual({
      priceConflict: true,
      source: 'customer',
      ownerAlert: null,
    });
  });
  it('cả hai xung đột → caption thắng (cảnh báo Owner giữ)', () => {
    const caption = checkCaptionPrices({ captionText: '199k', stockPricesVnd: stock });
    const customer = checkCustomerQuotedPrice({ commentText: 'báo 99k', stockPricesVnd: stock });
    expect(evaluatePriceRisk({ caption, customer })).toMatchObject({ source: 'caption' });
  });
  it('FR-150 cờ priceConflict → decideAction chuyển người, lý do price_conflict (tích hợp với main)', () => {
    const caption = checkCaptionPrices({ captionText: '199k', stockPricesVnd: stock });
    const { priceConflict } = evaluatePriceRisk({ caption });
    const d = decideAction({
      lang: 'vi',
      extract: {
        labels: [{ label: 'price', confidence: 0.9 }],
        refers_to_image: false,
        size: null,
        color: null,
        height_cm: null,
        weight_kg: null,
      },
      products: { candidates: ['Áo A'], missingAxes: [] },
      topics: [{ topic: 'product_info', sourced: true }],
      thread: { clarifyCount: 0, repeatCount: 0 },
      risks: { priceConflict, legalUnsourced: false, impersonation: false, stockStale: false },
    });
    expect(d).toMatchObject({ action: 'handoff', reason: 'price_conflict', needsHuman: true });
  });
});

describe('FR-158 buildPriceQuote — khoảng giá khi chưa rõ biến thể', () => {
  const v = (priceVnd: number, size: string | null, color: string | null = null) => ({
    priceVnd,
    size,
    color,
  });
  const none = { size: null, color: null };

  it('mọi biến thể cùng giá → single, không cần hỏi lại', () => {
    expect(buildPriceQuote({ variants: [v(199_000, 'M'), v(199_000, 'L')], said: none })).toEqual({
      kind: 'single',
      amountVnd: 199_000,
      missingAxes: [],
      knownPricesVnd: [199_000],
    });
  });
  it('khác giá, khách chưa nói size → range min/max + hỏi lại trục size', () => {
    expect(
      buildPriceQuote({
        variants: [v(199_000, 'S'), v(249_000, 'XL'), v(219_000, 'L')],
        said: none,
      }),
    ).toEqual({
      kind: 'range',
      minVnd: 199_000,
      maxVnd: 249_000,
      missingAxes: ['size'],
      knownPricesVnd: [199_000, 219_000, 249_000],
    });
  });
  it('khách đã nói size → chỉ xét biến thể đó (không báo khoảng)', () => {
    expect(
      buildPriceQuote({
        variants: [v(199_000, 'S'), v(249_000, 'XL')],
        said: { size: ' xl ', color: null },
      }),
    ).toMatchObject({ kind: 'single', amountVnd: 249_000, missingAxes: [] });
  });
  it('size nói rồi nhưng còn khác giá theo màu → range, hỏi màu', () => {
    const r = buildPriceQuote({
      variants: [v(199_000, 'M', 'đen'), v(229_000, 'M', 'trắng'), v(299_000, 'L', 'đen')],
      said: { size: 'M', color: null },
    });
    expect(r).toMatchObject({
      kind: 'range',
      minVnd: 199_000,
      maxVnd: 229_000,
      missingAxes: ['color'],
    });
  });
  it('khách nói size không tồn tại → none (không đoán giá)', () => {
    expect(
      buildPriceQuote({ variants: [v(199_000, 'S')], said: { size: 'XXL', color: null } }),
    ).toEqual({ kind: 'none', reason: 'variant_not_found', missingAxes: [], knownPricesVnd: [] });
  });
  it('không có biến thể / giá không hợp lệ → none (no_price)', () => {
    for (const variants of [[], [v(0, 'M')], [v(Number.NaN, 'M')], [v(-1, 'M')]]) {
      expect(buildPriceQuote({ variants, said: none })).toEqual({
        kind: 'none',
        reason: 'no_price',
        missingAxes: [],
        knownPricesVnd: [],
      });
    }
  });
  it('khác giá nhưng không biến thể nào có trục (size/màu null) → range, không có trục để hỏi', () => {
    const r = buildPriceQuote({ variants: [v(100_000, null), v(120_000, null)], said: none });
    expect(r).toMatchObject({ kind: 'range', missingAxes: [] });
  });
  it('trục chỉ có một giá trị khác nhau về giá thì không phải trục thiếu', () => {
    const r = buildPriceQuote({
      variants: [v(100_000, 'M', 'đen'), v(120_000, 'M', 'đen')],
      said: none,
    });
    expect(r).toMatchObject({ kind: 'range', missingAxes: [] });
  });
  it('FR-158 range + trục thiếu → decideAction hỏi lại biến thể (clarify variant_missing)', () => {
    const q = buildPriceQuote({ variants: [v(199_000, 'S'), v(249_000, 'XL')], said: none });
    const d = decideAction({
      lang: 'vi',
      extract: {
        labels: [{ label: 'price', confidence: 0.9 }],
        refers_to_image: false,
        size: null,
        color: null,
        height_cm: null,
        weight_kg: null,
      },
      products: { candidates: ['Áo A'], missingAxes: q.missingAxes },
      topics: [{ topic: 'product_info', sourced: true }],
      thread: { clarifyCount: 0, repeatCount: 0 },
      risks: {
        priceConflict: false,
        legalUnsourced: false,
        impersonation: false,
        stockStale: false,
      },
    });
    expect(d).toMatchObject({ action: 'clarify', reason: 'variant_missing' });
    expect(d.clarify?.axes).toEqual(['size']);
  });
});

describe('FR-150 FR-158 thuộc tính (fast-check, seed cố định)', () => {
  const price = fc.integer({ min: 1_000, max: 50_000_000 });
  const prices = fc.array(price, { minLength: 1, maxLength: 8 });

  it('caption chứa đúng các giá kho (dạng "<n>đ") → không bao giờ xung đột, bất kể thứ tự', () => {
    fc.assert(
      fc.property(prices, (stock) => {
        const caption = stock.map((p) => `${p}đ`).join(' | ');
        expect(checkCaptionPrices({ captionText: caption, stockPricesVnd: stock }).conflict).toBe(
          false,
        );
      }),
      SEED,
    );
  });
  it('xung đột ⇔ có số tiền caption ngoài tập giá kho; đảo thứ tự kho không đổi kết quả', () => {
    fc.assert(
      fc.property(prices, prices, (stock, ad) => {
        const caption = ad.map((p) => `${p}đ`).join(' ');
        const a = checkCaptionPrices({ captionText: caption, stockPricesVnd: stock });
        const b = checkCaptionPrices({
          captionText: caption,
          stockPricesVnd: [...stock].reverse(),
        });
        const expected = ad.some((p) => !stock.includes(p));
        expect(a.conflict).toBe(expected);
        expect(b).toEqual(a);
      }),
      SEED,
    );
  });
  it('khoảng giá: min ≤ max, mọi giá biến thể nằm trong [min,max], knownPrices tăng dần không trùng', () => {
    fc.assert(
      fc.property(prices, (list) => {
        const variants = list.map((priceVnd, i) => ({ priceVnd, size: `S${i}`, color: null }));
        const q = buildPriceQuote({ variants, said: { size: null, color: null } });
        expect(q.kind).not.toBe('none');
        const lo = Math.min(...list);
        const hi = Math.max(...list);
        if (q.kind === 'range') {
          expect([q.minVnd, q.maxVnd]).toEqual([lo, hi]);
          expect(q.minVnd).toBeLessThan(q.maxVnd);
          expect(q.missingAxes).toEqual(['size']);
        } else {
          expect(lo).toBe(hi);
        }
        expect(q.knownPricesVnd).toEqual([...new Set(list)].sort((x, y) => x - y));
      }),
      SEED,
    );
  });
  it('không bao giờ ném với văn bản/giá bất kỳ', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.double({ noNaN: false })), (text, stock) => {
        expect(() =>
          checkCaptionPrices({ captionText: text, stockPricesVnd: stock }),
        ).not.toThrow();
        expect(() =>
          checkCustomerQuotedPrice({ commentText: text, stockPricesVnd: stock }),
        ).not.toThrow();
      }),
      SEED,
    );
  });
});
