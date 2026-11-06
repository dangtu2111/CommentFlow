import { describe, expect, it } from 'vitest';
import { buildPriceSnapshot, parsePriceSnapshot } from './price-snapshot';

const T = new Date('2026-11-01T03:00:00.000Z');
const none = { stock: null, updatedFromSourceAt: null };

describe('buildPriceSnapshot', () => {
  it('chụp giá sản phẩm và biến thể theo dạng snake_case của docs/10', () => {
    const snap = buildPriceSnapshot([
      { productId: 'p1', variantId: 'v1', priceVnd: 199000, stock: 4, updatedFromSourceAt: T },
    ]);
    expect(snap).toEqual([
      {
        product_id: 'p1',
        variant_id: 'v1',
        price_vnd: 199000,
        stock: 4,
        updated_from_source_at: '2026-11-01T03:00:00.000Z',
      },
    ]);
  });

  it('bỏ mục không có giá và giữ null của tồn kho / mốc đồng bộ', () => {
    const snap = buildPriceSnapshot([
      { productId: 'p1', priceVnd: null, stock: 3, updatedFromSourceAt: T },
      { productId: 'p2', priceVnd: 50000, ...none },
    ]);
    expect(snap).toEqual([
      {
        product_id: 'p2',
        variant_id: null,
        price_vnd: 50000,
        stock: null,
        updated_from_source_at: null,
      },
    ]);
  });

  it('loại trùng (sản phẩm, biến thể) giữ mục đầu và sắp xếp ổn định', () => {
    const snap = buildPriceSnapshot([
      { productId: 'b', priceVnd: 2, ...none },
      { productId: 'a', variantId: 'v2', priceVnd: 3, ...none },
      { productId: 'a', variantId: 'v1', priceVnd: 4, ...none },
      { productId: 'b', priceVnd: 9, ...none },
    ]);
    expect(snap.map((e) => [e.product_id, e.variant_id, e.price_vnd])).toEqual([
      ['a', 'v1', 4],
      ['a', 'v2', 3],
      ['b', null, 2],
    ]);
  });

  it('từ chối giá âm / không nguyên (dữ liệu hỏng không được vào ảnh chụp)', () => {
    expect(() => buildPriceSnapshot([{ productId: 'p', priceVnd: -1, ...none }])).toThrow();
    expect(() => buildPriceSnapshot([{ productId: 'p', priceVnd: 10.5, ...none }])).toThrow();
  });

  it('danh sách rỗng → ảnh chụp rỗng', () => {
    expect(buildPriceSnapshot([])).toEqual([]);
  });
});

describe('parsePriceSnapshot', () => {
  it('đọc lại đúng thứ đã dựng (vòng JSON)', () => {
    const snap = buildPriceSnapshot([
      { productId: 'p1', variantId: 'v1', priceVnd: 1000, stock: 0, updatedFromSourceAt: T },
    ]);
    const r = parsePriceSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual(snap);
  });

  const base = { product_id: 'p', variant_id: null, stock: null, updated_from_source_at: null };
  it.each([
    ['không phải mảng', {}],
    ['thiếu price_vnd', [{ product_id: 'p', variant_id: null }]],
    ['giá âm', [{ ...base, price_vnd: -5 }]],
    ['mốc thời gian sai', [{ ...base, price_vnd: 5, updated_from_source_at: 'hôm qua' }]],
  ])('từ chối %s', (_n, value) => {
    expect(parsePriceSnapshot(value).success).toBe(false);
  });
});
