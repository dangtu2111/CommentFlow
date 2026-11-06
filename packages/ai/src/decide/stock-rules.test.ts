import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideAction } from './decide-action';
import {
  anyStockStale,
  DEFAULT_STOCK_STALE_DAYS,
  evaluateStockRules,
  MAX_ALTERNATIVES,
} from './stock-rules';

const NOW = new Date('2026-11-06T00:00:00.000Z');
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

type V = { status?: string; stock: number | null; priceVnd?: number | null; at?: Date | null };
const variant = (v: V) => ({
  status: v.status ?? 'active',
  stock: v.stock,
  priceVnd: v.priceVnd === undefined ? 100_000 : v.priceVnd,
  updatedFromSourceAt: v.at === undefined ? null : v.at,
});

function product(over: Record<string, unknown> = {}, variants: V[] = [{ stock: 5 }]) {
  return {
    id: 'p1',
    name: 'Áo thun',
    source: 'manual',
    status: 'active',
    category: 'Áo',
    updatedFromSourceAt: ago(DAY),
    syncError: false,
    variants: variants.map(variant),
    ...over,
  };
}

const run = (p: unknown, extra: Record<string, unknown> = {}) =>
  evaluateStockRules({ now: NOW, product: p, ...extra });

const UNKNOWN = {
  freshness: 'unknown',
  stockStale: true,
  availability: 'unknown',
  canStateQuantity: false,
  alternatives: [],
};

describe('FR-151 độ tươi tồn kho', () => {
  it('mặc định 3 ngày; nguồn manual trong hạn → tươi, nói được số lượng', () => {
    expect(DEFAULT_STOCK_STALE_DAYS).toBe(3);
    expect(run(product())).toMatchObject({
      freshness: 'fresh',
      stockStale: false,
      availability: 'in_stock',
      canStateQuantity: true,
    });
  });

  it.each(['manual', 'excel'])('nguồn %s cũ hơn staleDays → cũ, không nói số lượng', (source) => {
    const r = run(product({ source, updatedFromSourceAt: ago(3 * DAY + 1) }));
    expect(r).toMatchObject({
      freshness: 'stale',
      stockStale: true,
      availability: 'unknown',
      canStateQuantity: false,
      alternatives: [],
    });
  });

  it('đúng ngưỡng staleDays vẫn tươi; +1 ms thì cũ; staleDays tùy chỉnh', () => {
    expect(run(product({ updatedFromSourceAt: ago(3 * DAY) })).freshness).toBe('fresh');
    expect(run(product({ updatedFromSourceAt: ago(3 * DAY + 1) })).freshness).toBe('stale');
    expect(run(product({ updatedFromSourceAt: ago(2 * DAY) }), { staleDays: 1 }).freshness).toBe(
      'stale',
    );
    expect(run(product({ updatedFromSourceAt: ago(10 * DAY) }), { staleDays: 30 }).freshness).toBe(
      'fresh',
    );
  });

  it('mốc thiếu → cũ; mốc tương lai (lệch đồng hồ) → tươi; chuỗi ISO được nhận', () => {
    expect(run(product({ updatedFromSourceAt: null })).freshness).toBe('stale');
    expect(run(product({ updatedFromSourceAt: new Date(NOW.getTime() + DAY) })).freshness).toBe(
      'fresh',
    );
    expect(run(product({ updatedFromSourceAt: ago(DAY).toISOString() })).freshness).toBe('fresh');
  });

  it('lấy mốc CŨ NHẤT giữa sản phẩm và biến thể (thiên về chặn)', () => {
    const stale = run(
      product({}, [
        { stock: 5, at: ago(5 * DAY) },
        { stock: 2, at: ago(DAY) },
      ]),
    );
    expect(stale.freshness).toBe('stale');
    const ok = run(
      product({}, [
        { stock: 5, at: ago(DAY) },
        { stock: 2, at: null },
      ]),
    );
    expect(ok.freshness).toBe('fresh');
  });

  it('nguồn đồng bộ: không lỗi → tươi dù mốc cũ; có lỗi đồng bộ + quá hạn → cũ', () => {
    const old = ago(30 * DAY);
    expect(run(product({ source: 'shopify', updatedFromSourceAt: old })).freshness).toBe('fresh');
    expect(run(product({ source: 'shopify', updatedFromSourceAt: null })).freshness).toBe('fresh');
    const bad = run(product({ source: 'shopify', updatedFromSourceAt: old, syncError: true }));
    expect(bad).toMatchObject({ freshness: 'stale', stockStale: true });
    const recent = product({ source: 'shopify', syncError: true, updatedFromSourceAt: ago(DAY) });
    expect(run(recent).freshness).toBe('fresh');
  });

  it('đầu vào hỏng/thiếu → unknown, stockStale=true, không ném', () => {
    const bad: unknown[] = [
      undefined,
      null,
      42,
      {},
      { now: 'không phải ngày', product: product() },
      { now: NOW },
      { now: NOW, product: { id: 'x' } },
      { now: NOW, product: product({ source: 'lạ' }) },
      { now: null, product: product() },
      { now: 0, product: product() },
      { now: NOW, product: product({ updatedFromSourceAt: 0 }) },
      { now: NOW, product: product(), staleDays: 0 },
      { now: NOW, product: product(), staleDays: 1.5 },
    ];
    for (const raw of bad) expect(evaluateStockRules(raw)).toEqual(UNKNOWN);
  });
});

describe('FR-157 mẫu ngưng/hết hàng', () => {
  it('sản phẩm archived → discontinued, không tính là tồn kho cũ', () => {
    const r = run(product({ status: 'archived', updatedFromSourceAt: ago(30 * DAY) }));
    expect(r).toMatchObject({
      freshness: 'stale',
      availability: 'discontinued',
      stockStale: false,
      canStateQuantity: false,
    });
  });

  it('mọi biến thể đang bán hết hàng (tươi) → sold_out', () => {
    const r = run(product({}, [{ stock: 0 }, { stock: 0 }]));
    expect(r).toMatchObject({ availability: 'sold_out', stockStale: false, canStateQuantity: false });
  });

  it('biến thể đã archived bị bỏ qua khi xét tồn', () => {
    expect(run(product({}, [{ stock: 0 }, { stock: 9, status: 'archived' }])).availability).toBe(
      'sold_out',
    );
    expect(run(product({}, [{ stock: 0 }, { stock: 1 }])).availability).toBe('in_stock');
  });

  it('tồn null không được hiểu là hết hàng; không có biến thể đang bán → unknown', () => {
    expect(run(product({}, [{ stock: null }])).availability).toBe('unknown');
    expect(run(product({}, [{ stock: 0 }, { stock: null }])).availability).toBe('unknown');
    expect(run(product({}, [{ stock: null }, { stock: 3 }])).availability).toBe('in_stock');
    expect(run(product({}, [])).availability).toBe('unknown');
    expect(run(product({}, [{ stock: 4, status: 'archived' }])).availability).toBe('unknown');
  });

  it('dữ liệu cũ thì KHÔNG nói hết hàng, kể cả khi mọi tồn = 0, và không gợi ý', () => {
    const r = run(product({ updatedFromSourceAt: ago(9 * DAY) }, [{ stock: 0 }]), {
      suggestAlternatives: true,
      catalog: [product({ id: 'p2', name: 'Áo B' })],
    });
    expect(r.availability).toBe('unknown');
    expect(r.alternatives).toEqual([]);
  });
});

describe('FR-157 gợi ý thay thế (chỉ phần gợi ý)', () => {
  const soldOut = product({}, [{ stock: 0 }]);
  const alt = (id: string, name: string, price: number, over: Record<string, unknown> = {}) =>
    product({ id, name, ...over }, [{ stock: 3, priceVnd: price }]);

  it('mặc định TẮT: hết hàng nhưng không gợi ý', () => {
    expect(run(soldOut, { catalog: [alt('p2', 'Áo B', 1)] }).alternatives).toEqual([]);
  });

  it('bật: ≤ 2 mẫu cùng danh mục, sắp giá↑/tên/id', () => {
    const r = run(soldOut, {
      suggestAlternatives: true,
      catalog: [
        alt('p5', 'Áo E', 300_000),
        alt('p4', 'Áo D', 100_000),
        alt('p3', 'Áo C', 100_000),
        alt('p2', 'Áo B', 200_000),
      ],
    });
    expect(MAX_ALTERNATIVES).toBe(2);
    expect(r.alternatives).toEqual([
      { productId: 'p3', name: 'Áo C', priceVnd: 100_000 },
      { productId: 'p4', name: 'Áo D', priceVnd: 100_000 },
    ]);
  });

  it('hòa cả giá lẫn tên → theo id; giá lấy từ biến thể còn hàng rẻ nhất', () => {
    const tie = run(soldOut, {
      suggestAlternatives: true,
      catalog: [alt('p9', 'Áo X', 50_000), alt('p8', 'Áo X', 50_000)],
    });
    expect(tie.alternatives.map((a) => a.productId)).toEqual(['p8', 'p9']);
    const multi = product({ id: 'p7', name: 'Áo Y' }, [
      { stock: 0, priceVnd: 10_000 },
      { stock: 2, priceVnd: 70_000 },
      { stock: 2, priceVnd: 60_000 },
    ]);
    const only = run(soldOut, { suggestAlternatives: true, catalog: [multi] });
    expect(only.alternatives).toEqual([{ productId: 'p7', name: 'Áo Y', priceVnd: 60_000 }]);
  });

  it('archived cũng được gợi ý thay thế', () => {
    const r = run(product({ status: 'archived' }), {
      suggestAlternatives: true,
      catalog: [alt('p2', 'Áo B', 1)],
    });
    expect(r.availability).toBe('discontinued');
    expect(r.alternatives).toHaveLength(1);
  });

  it('loại: chính nó, khác/không danh mục, ngưng bán, hết hàng, cũ, thiếu giá, hỏng', () => {
    const r = run(soldOut, {
      suggestAlternatives: true,
      catalog: [
        alt('p1', 'Chính nó', 1),
        alt('p2', 'Khác danh mục', 1, { category: 'Quần' }),
        alt('p3', 'Không danh mục', 1, { category: null }),
        alt('p4', 'Danh mục rỗng', 1, { category: '  ' }),
        alt('p5', 'Ngưng', 1, { status: 'archived' }),
        product({ id: 'p6', name: 'Hết' }, [{ stock: 0 }]),
        alt('p7', 'Cũ', 1, { updatedFromSourceAt: ago(9 * DAY) }),
        product({ id: 'p8', name: 'Không giá' }, [{ stock: 3, priceVnd: null }]),
        { id: 'rác' },
        'rác',
        alt('p10', 'Hợp lệ', 5),
      ],
    });
    expect(r.alternatives.map((a) => a.productId)).toEqual(['p10']);
  });

  it('sản phẩm hết hàng không có danh mục → không gợi ý', () => {
    const r = run(product({ category: null }, [{ stock: 0 }]), {
      suggestAlternatives: true,
      catalog: [alt('p2', 'Áo B', 1, { category: null })],
    });
    expect(r.alternatives).toEqual([]);
  });

  it('danh mục so khớp không phân biệt hoa/dấu', () => {
    const r = run(product({ category: 'ÁO Thun' }, [{ stock: 0 }]), {
      suggestAlternatives: true,
      catalog: [alt('p2', 'Áo B', 1, { category: 'ao thun' })],
    });
    expect(r.alternatives).toHaveLength(1);
  });

  it('còn hàng thì không gợi ý dù bật; không có catalog → rỗng', () => {
    const inStock = run(product(), { suggestAlternatives: true, catalog: [alt('p2', 'B', 1)] });
    expect(inStock.alternatives).toEqual([]);
    expect(run(soldOut, { suggestAlternatives: true }).alternatives).toEqual([]);
  });

  it('suggestAlternatives không phải boolean → đầu vào hỏng, không gợi ý', () => {
    const r = run(soldOut, { suggestAlternatives: 'yes', catalog: [alt('p2', 'B', 1)] });
    expect(r).toEqual(UNKNOWN);
  });
});

describe('FR-151 nối decideAction', () => {
  const base = {
    lang: 'vi',
    extract: {
      labels: [{ label: 'price' }],
      refers_to_image: false,
      size: 'M',
      color: 'den',
      height_cm: null,
      weight_kg: null,
    },
    products: { candidates: ['Áo thun'], missingAxes: [] },
    topics: [{ topic: 'product_info', sourced: true }],
    thread: { clarifyCount: 0, repeatCount: 0 },
  };
  const risks = (stockStale: boolean) => ({
    priceConflict: false,
    legalUnsourced: false,
    impersonation: false,
    stockStale,
  });

  it('anyStockStale: rỗng → false; có một cũ → true', () => {
    expect(anyStockStale([])).toBe(false);
    expect(anyStockStale([{ stockStale: false }, { stockStale: false }])).toBe(false);
    expect(anyStockStale([{ stockStale: false }, { stockStale: true }])).toBe(true);
  });

  it('tồn cũ → redirect stock_stale + mẫu stock_check', () => {
    const outcome = run(product({ updatedFromSourceAt: ago(9 * DAY) }));
    const d = decideAction({ ...base, risks: risks(anyStockStale([outcome])) });
    expect(d).toMatchObject({ action: 'redirect', reason: 'stock_stale', needsSupportTag: true });
    expect(d.redirectTemplates).toContain('stock_check');
  });

  it('tồn tươi → trả lời như thường', () => {
    const d = decideAction({ ...base, risks: risks(anyStockStale([run(product())])) });
    expect(d.action).toBe('answer');
  });
});

describe('FR-151 FR-157 property-based', () => {
  const arbDate = fc.option(
    fc.integer({ min: -DAY, max: 20 * DAY }).map((ms) => ago(ms)),
    { nil: null },
  );
  const arbVariant = fc.record({
    status: fc.constantFrom('active', 'archived'),
    stock: fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
    priceVnd: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
    updatedFromSourceAt: arbDate,
  });
  const arbProduct = fc.record({
    id: fc.string({ minLength: 1, maxLength: 4 }),
    name: fc.string({ minLength: 1, maxLength: 6 }),
    source: fc.constantFrom('manual', 'excel', 'shopify', 'kiotviet'),
    status: fc.constantFrom('active', 'archived'),
    category: fc.option(fc.constantFrom('Áo', 'ao', 'Quần', ' '), { nil: null }),
    updatedFromSourceAt: arbDate,
    syncError: fc.boolean(),
    variants: fc.array(arbVariant, { maxLength: 4 }),
  });

  it('dữ liệu cũ không bao giờ cho in_stock/sold_out; stale ⇒ stockStale (trừ archived)', () => {
    fc.assert(
      fc.property(arbProduct, fc.integer({ min: 1, max: 10 }), (p, staleDays) => {
        const r = run(p, { staleDays });
        if (r.freshness !== 'fresh') {
          expect(['unknown', 'discontinued']).toContain(r.availability);
          expect(r.canStateQuantity).toBe(false);
          expect(r.stockStale).toBe(r.availability !== 'discontinued');
        }
        if (r.canStateQuantity) expect(r.availability).toBe('in_stock');
      }),
    );
  });

  it('gợi ý ≤ 2, thỏa điều kiện, và hoán vị catalog không đổi kết quả', () => {
    fc.assert(
      fc.property(arbProduct, fc.array(arbProduct, { maxLength: 6 }), (p, catalog) => {
        const a = run(p, { suggestAlternatives: true, catalog });
        const b = run(p, { suggestAlternatives: true, catalog: [...catalog].reverse() });
        expect(a.alternatives.length).toBeLessThanOrEqual(MAX_ALTERNATIVES);
        expect(a.alternatives).toEqual(b.alternatives);
        if (a.availability !== 'sold_out' && a.availability !== 'discontinued') {
          expect(a.alternatives).toEqual([]);
        }
        for (const alt of a.alternatives) {
          expect(alt.productId).not.toBe(p.id);
          const valid = catalog.some(
            (c) =>
              c.id === alt.productId && c.status === 'active' && run(c).availability === 'in_stock',
          );
          expect(valid).toBe(true);
        }
      }),
    );
  });

  it('đầu vào rác bất kỳ không ném và luôn chặn (stockStale=true)', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const r = evaluateStockRules(raw);
        expect(r.freshness).toBe('unknown');
        expect(r.stockStale).toBe(true);
      }),
    );
  });
});
