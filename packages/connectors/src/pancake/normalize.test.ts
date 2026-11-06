import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PancakeProduct, PancakeVariant } from './connector';
import { buildPancakeImportPlan, parsePancakeMoney } from './normalize';

const variant = (over: Partial<PancakeVariant> = {}): PancakeVariant => ({
  id: 'v1',
  sku: 'SKU1',
  price: 100000,
  quantity: 3,
  attrs: { Màu: 'Đỏ' },
  sellable: true,
  ...over,
});
const product = (over: Partial<PancakeProduct> = {}): PancakeProduct => ({
  id: 'p1',
  title: 'Áo',
  category: 'Áo thun',
  published: true,
  url: null,
  variants: [variant()],
  ...over,
});
const plan = (...products: PancakeProduct[]) => buildPancakeImportPlan({ products });

describe('FR-122 parsePancakeMoney', () => {
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
    expect(parsePancakeMoney(raw)).toBe(expected);
  });

  it('property: chỉ số nguyên trong [0, 10^12) mới qua, giá trị không đổi', () => {
    fc.assert(
      fc.property(fc.double(), (n) => {
        const valid = Number.isInteger(n) && n >= 0 && n < 1_000_000_000_000;
        expect(parsePancakeMoney(n)).toBe(valid ? n : null);
      }),
    );
  });
});

describe('FR-122 buildPancakeImportPlan', () => {
  it('chuyển sản phẩm đang bán thành kế hoạch ghi', () => {
    const [p] = plan(product());
    expect(p).toMatchObject({
      externalId: 'p1',
      name: 'Áo',
      category: 'Áo thun',
      url: null,
      priceVnd: 100000,
      compareAtVnd: null,
      stock: 3,
    });
    expect(p?.variants[0]).toMatchObject({
      externalId: 'v1',
      sku: 'SKU1',
      priceVnd: 100000,
      compareAtVnd: null,
      stock: 3,
    });
    expect(p?.variantsSnapshot).toEqual([
      { sku: 'SKU1', attrs: { Màu: 'Đỏ' }, priceVnd: 100000, compareAtVnd: null, stock: 3 },
    ]);
  });

  it('bỏ sản phẩm ẩn và biến thể ẩn', () => {
    const out = plan(
      product({ id: 'a', published: false }),
      product({
        id: 'b',
        variants: [variant({ id: 'x', sellable: false }), variant({ id: 'y' })],
      }),
    );
    expect(out.map((p) => p.externalId)).toEqual(['b']);
    expect(out[0]?.variants.map((v) => v.externalId)).toEqual(['y']);
  });

  it('danh mục rỗng → null', () => {
    expect(plan(product({ category: '' }))[0]?.category).toBeNull();
  });

  it('giá sản phẩm = giá thấp nhất; giá lẻ → null', () => {
    const [p] = plan(
      product({
        variants: [
          variant({ id: '1', price: 300 }),
          variant({ id: '2', price: 100 }),
          variant({ id: '3', price: 12.5 }),
          variant({ id: '4', price: null }),
        ],
      }),
    );
    expect(p?.priceVnd).toBe(100);
    expect(p?.variants.map((v) => v.priceVnd)).toEqual([300, 100, null, null]);
  });

  it('không biến thể nào có giá → priceVnd null', () => {
    expect(plan(product({ variants: [variant({ price: null })] }))[0]?.priceVnd).toBeNull();
  });

  it('tồn: tổng khi mọi biến thể có tồn nguyên ≥ 0; thiếu/lẻ/âm → null', () => {
    const sum = plan(
      product({ variants: [variant({ id: '1', quantity: 2 }), variant({ id: '2', quantity: 3 })] }),
    )[0];
    expect(sum?.stock).toBe(5);
    for (const bad of [null, 1.5, -1]) {
      const [p] = plan(
        product({
          variants: [variant({ id: '1', quantity: 2 }), variant({ id: '2', quantity: bad })],
        }),
      );
      expect(p?.stock).toBeNull();
      expect(p?.variants[1]?.stock).toBeNull();
    }
  });

  it('không còn biến thể bán được → stock/giá null', () => {
    const [p] = plan(product({ variants: [variant({ sellable: false })] }));
    expect(p).toMatchObject({ stock: null, priceVnd: null, variants: [] });
  });

  it('searchText có tên + SKU + thuộc tính, KHÔNG có giá/tồn (nguyên tắc #4)', () => {
    const [p] = plan(
      product({
        title: 'Áo polo',
        variants: [
          variant({ sku: 'POLO-9', price: 777777, quantity: 4242, attrs: { Màu: 'Xanh' } }),
        ],
      }),
    );
    expect(p?.searchText).toContain('polo');
    expect(p?.searchText.toLowerCase()).toContain('polo 9');
    expect(p?.searchText).not.toContain('777777');
    expect(p?.searchText).not.toContain('4242');
  });

  it('SKU null không đưa vào searchText', () => {
    const [p] = plan(product({ variants: [variant({ sku: null })] }));
    expect(p?.searchText).not.toContain('null');
  });

  it('property: số sản phẩm = số sản phẩm đang bán; giá/tồn là null hoặc nguyên ≥ 0', () => {
    const variantArb = fc.record({
      id: fc.string({ minLength: 1 }),
      sku: fc.option(fc.string(), { nil: null }),
      price: fc.option(fc.double(), { nil: null }),
      quantity: fc.option(fc.double(), { nil: null }),
      attrs: fc.dictionary(fc.string({ minLength: 1 }), fc.string({ minLength: 1 })),
      sellable: fc.boolean(),
    });
    const productArb = fc.record({
      id: fc.string({ minLength: 1 }),
      title: fc.string({ minLength: 1 }),
      category: fc.string(),
      published: fc.boolean(),
      url: fc.constant(null),
      variants: fc.array(variantArb, { maxLength: 4 }),
    });
    fc.assert(
      fc.property(fc.array(productArb, { maxLength: 5 }), (products) => {
        const out = buildPancakeImportPlan({ products });
        expect(out).toHaveLength(products.filter((p) => p.published).length);
        for (const p of out) {
          for (const v of p.variants) {
            expect(v.priceVnd === null || (Number.isInteger(v.priceVnd) && v.priceVnd >= 0)).toBe(
              true,
            );
            expect(v.stock === null || (Number.isInteger(v.stock) && v.stock >= 0)).toBe(true);
          }
        }
      }),
    );
  });
});
