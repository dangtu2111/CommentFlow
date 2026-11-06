import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { KiotVietCatalog, KiotVietProduct, KiotVietVariant } from './connector';
import { buildKiotVietImportPlan, parseKiotVietMoney } from './normalize';

const variant = (over: Partial<KiotVietVariant> = {}): KiotVietVariant => ({
  id: '1',
  sku: 'SP1',
  price: 150000,
  quantity: 5,
  attrs: {},
  sellable: true,
  ...over,
});

const product = (over: Partial<KiotVietProduct> = {}): KiotVietProduct => ({
  id: '100',
  title: 'Áo thun',
  category: 'Áo',
  published: true,
  url: null,
  variants: [variant()],
  ...over,
});

const plan = (...products: KiotVietProduct[]) => buildKiotVietImportPlan({ products });

describe('FR-122 parseKiotVietMoney', () => {
  it.each([
    [150000, 150000],
    [0, 0],
    [999_999_999_999, 999_999_999_999],
    [12.5, null],
    [-1, null],
    [1_000_000_000_000, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [null, null],
    [undefined, null],
  ])('%s → %s', (raw, expected) => {
    expect(parseKiotVietMoney(raw)).toBe(expected);
  });

  it('số nguyên VND hợp lệ luôn giữ nguyên; số lẻ luôn bị từ chối (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999_999 }), (n) => {
        expect(parseKiotVietMoney(n)).toBe(n);
        expect(parseKiotVietMoney(n + 0.5)).toBeNull();
      }),
    );
  });
});

describe('FR-122 buildKiotVietImportPlan', () => {
  it('chỉ giữ sản phẩm đang bán', () => {
    const result = plan(product({ id: '1' }), product({ id: '2', published: false }));
    expect(result.map((p) => p.externalId)).toEqual(['1']);
  });

  it('bỏ biến thể không bán; giá = thấp nhất; tồn = tổng', () => {
    const [p] = plan(
      product({
        variants: [
          variant({ id: 'a', sku: 'A', price: 200000, quantity: 2, attrs: { Màu: 'Đỏ' } }),
          variant({ id: 'b', sku: 'B', price: 150000, quantity: 3 }),
          variant({ id: 'c', sku: 'C', price: 1, quantity: 99, sellable: false }),
        ],
      }),
    );
    expect(p?.variants.map((v) => v.externalId)).toEqual(['a', 'b']);
    expect(p?.priceVnd).toBe(150000);
    expect(p?.stock).toBe(5);
    expect(p?.compareAtVnd).toBeNull();
    expect(p?.category).toBe('Áo');
    expect(p?.url).toBeNull();
    expect(p?.variants[0]?.attrsNorm).toBeDefined();
    expect(p?.variantsSnapshot).toHaveLength(2);
  });

  it('danh mục rỗng → null; giá lẻ → null; tồn lẻ/âm/thiếu → null', () => {
    const [p] = plan(
      product({
        category: '',
        variants: [
          variant({ id: 'a', price: 12.5, quantity: 1.5 }),
          variant({ id: 'b', price: null, quantity: -1 }),
        ],
      }),
    );
    expect(p?.category).toBeNull();
    expect(p?.priceVnd).toBeNull();
    expect(p?.stock).toBeNull();
    expect(p?.variants.map((v) => v.stock)).toEqual([null, null]);
    expect(p?.variants.map((v) => v.priceVnd)).toEqual([null, null]);
  });

  it('một biến thể không biết tồn → tồn sản phẩm không biết; không còn biến thể → tồn null', () => {
    const [mixed] = plan(
      product({
        variants: [variant({ id: 'a', quantity: 2 }), variant({ id: 'b', quantity: null })],
      }),
    );
    expect(mixed?.stock).toBeNull();
    const [none] = plan(product({ variants: [] }));
    expect(none?.stock).toBeNull();
    expect(none?.priceVnd).toBeNull();
  });

  it('searchText có tên/SKU, KHÔNG có giá/tồn (nguyên tắc #4)', () => {
    const [p] = plan(
      product({ variants: [variant({ sku: 'ABC1', price: 777000, quantity: 4242 })] }),
    );
    expect(p?.searchText).toContain('abc1');
    expect(p?.searchText).not.toContain('777000');
    expect(p?.searchText).not.toContain('4242');
  });

  it('property: không bao giờ ném lỗi; giá/tồn đầu ra luôn là số nguyên ≥ 0 hoặc null', () => {
    const arbVariant = fc.record({
      id: fc.string({ minLength: 1, maxLength: 6 }),
      sku: fc.option(fc.string({ maxLength: 8 }), { nil: null }),
      price: fc.option(fc.double({ noNaN: false }), { nil: null }),
      quantity: fc.option(fc.double(), { nil: null }),
      attrs: fc.dictionary(fc.string({ maxLength: 5 }), fc.string({ maxLength: 5 })),
      sellable: fc.boolean(),
    });
    const arbProduct = fc.record({
      id: fc.string({ minLength: 1, maxLength: 6 }),
      title: fc.string({ minLength: 1, maxLength: 8 }),
      category: fc.string({ maxLength: 5 }),
      published: fc.boolean(),
      url: fc.constant(null),
      variants: fc.array(arbVariant, { maxLength: 4 }),
    });
    fc.assert(
      fc.property(fc.array(arbProduct, { maxLength: 4 }), (products) => {
        const catalog: KiotVietCatalog = { products };
        for (const p of buildKiotVietImportPlan(catalog)) {
          for (const n of [
            p.priceVnd,
            p.stock,
            ...p.variants.flatMap((v) => [v.priceVnd, v.stock]),
          ]) {
            expect(n === null || (Number.isInteger(n) && n >= 0)).toBe(true);
          }
        }
      }),
    );
  });
});
