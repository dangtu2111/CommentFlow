import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SapoCatalog, SapoProduct, SapoVariant } from './connector';
import { buildSapoImportPlan, parseSapoMoney } from './normalize';

const variant = (over: Partial<SapoVariant> = {}): SapoVariant => ({
  id: '11',
  sku: 'SKU-1',
  title: 'Đen / M',
  price: '150000.00',
  compareAtPrice: null,
  quantity: 3,
  managed: true,
  optionValues: ['Đen', 'M', null],
  ...over,
});

const product = (over: Partial<SapoProduct> = {}): SapoProduct => ({
  id: '1',
  title: 'Áo thun',
  handle: 'ao-thun',
  productType: 'Áo',
  published: true,
  optionNames: ['Màu', 'Size'],
  url: null,
  variants: [variant()],
  ...over,
});

const plan = (...products: SapoProduct[]) =>
  buildSapoImportPlan({ products } satisfies SapoCatalog);

describe('parseSapoMoney', () => {
  it.each([
    ['150000', 150000],
    ['150000.00', 150000],
    ['0', 0],
    [' 99000.0 ', 99000],
  ])('%s → %s', (raw, expected) => {
    expect(parseSapoMoney(raw)).toBe(expected);
  });
  it.each(['150000.50', '-1', 'abc', '', '1e5', '1,000', '9999999999999', null, undefined])(
    '%s → null',
    (raw) => {
      expect(parseSapoMoney(raw)).toBeNull();
    },
  );
  it('property: mọi số nguyên đồng hợp lệ đi vòng đúng; chuỗi lẻ → null', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999_999 }), (n) => {
        expect(parseSapoMoney(String(n))).toBe(n);
        expect(parseSapoMoney(`${n}.00`)).toBe(n);
        expect(parseSapoMoney(`${n}.5`)).toBeNull();
      }),
    );
  });
});

describe('FR-122 buildSapoImportPlan', () => {
  it('bỏ sản phẩm chưa xuất bản', () => {
    expect(
      plan(product({ published: false }), product({ id: '2' })).map((p) => p.externalId),
    ).toEqual(['2']);
  });

  it('dựng sản phẩm/biến thể: id là chuỗi id Sapo, thuộc tính theo tên tùy chọn', () => {
    const [p] = plan(product());
    expect(p).toMatchObject({
      externalId: '1',
      name: 'Áo thun',
      category: 'Áo',
      url: null,
      priceVnd: 150000,
      stock: 3,
    });
    expect(p?.variants[0]).toMatchObject({
      externalId: '11',
      sku: 'SKU-1',
      attrs: { Màu: 'Đen', Size: 'M' },
      priceVnd: 150000,
      compareAtVnd: null,
      stock: 3,
    });
  });

  it('giá gốc 0 → null; giá gốc khác giữ đúng số nguồn', () => {
    const [p] = plan(product({ variants: [variant({ compareAtPrice: '0' })] }));
    expect(p?.variants[0]?.compareAtVnd).toBeNull();
    const [q] = plan(product({ variants: [variant({ compareAtPrice: '200000' })] }));
    expect(q?.variants[0]?.compareAtVnd).toBe(200000);
  });

  it('giá sai dạng → null (không bịa)', () => {
    const [p] = plan(product({ variants: [variant({ price: '12.5' })] }));
    expect(p?.variants[0]?.priceVnd).toBeNull();
    expect(p?.priceVnd).toBeNull();
  });

  it('tồn chỉ khi shop quản lý tồn và số ≥ 0', () => {
    const stocks = [
      variant({ managed: false, quantity: 9 }),
      variant({ id: '12', quantity: -2 }),
      variant({ id: '13', quantity: null }),
      variant({ id: '14', quantity: 4 }),
    ];
    const [p] = plan(product({ variants: stocks }));
    expect(p?.variants.map((v) => v.stock)).toEqual([null, null, null, 4]);
    expect(p?.stock).toBeNull(); // thiếu tồn một biến thể → không tổng
  });

  it('tồn sản phẩm = tổng khi mọi biến thể đều có tồn; giá sản phẩm = thấp nhất', () => {
    const [p] = plan(
      product({
        variants: [
          variant({ id: '1', price: '300000', quantity: 2 }),
          variant({ id: '2', price: '100000', quantity: 5 }),
        ],
      }),
    );
    expect(p?.stock).toBe(7);
    expect(p?.priceVnd).toBe(100000);
  });

  it('bỏ tùy chọn mặc định Default Title; SKU rỗng → null', () => {
    const [p] = plan(
      product({
        optionNames: ['Title'],
        variants: [variant({ sku: '', optionValues: ['Default Title', null, null] })],
      }),
    );
    expect(p?.variants[0]).toMatchObject({ attrs: {}, sku: null });
  });

  it('category rỗng → null; URL chỉ http(s)', () => {
    expect(plan(product({ productType: '' }))[0]?.category).toBeNull();
    expect(plan(product({ url: 'javascript:alert(1)' }))[0]?.url).toBeNull();
    expect(plan(product({ url: 'không phải url' }))[0]?.url).toBeNull();
    expect(plan(product({ url: 'https://shop.example/p/1' }))[0]?.url).toBe(
      'https://shop.example/p/1',
    );
  });

  it('searchText không chứa giá hay tồn (nguyên tắc #4)', () => {
    const [p] = plan(
      product({ variants: [variant({ price: '777888', quantity: 424242, sku: 'AB-1' })] }),
    );
    expect(p?.searchText).not.toContain('777888');
    expect(p?.searchText).not.toContain('424242');
    expect(p?.searchText).toContain('ab 1'); // SKU đã chuẩn hóa (thường, bỏ gạch)
  });

  it('property: không bao giờ ném lỗi; mọi giá/tồn ra là số nguyên ≥ 0 hoặc null', () => {
    const arbVariant = fc.record({
      id: fc.string({ minLength: 1, maxLength: 6 }),
      sku: fc.option(fc.string({ maxLength: 8 }), { nil: null }),
      title: fc.string({ maxLength: 8 }),
      price: fc.option(fc.string({ maxLength: 14 }), { nil: null }),
      compareAtPrice: fc.option(fc.string({ maxLength: 14 }), { nil: null }),
      quantity: fc.option(fc.integer({ min: -50, max: 5000 }), { nil: null }),
      managed: fc.boolean(),
      optionValues: fc.tuple(
        fc.option(fc.string({ maxLength: 5 }), { nil: null }),
        fc.option(fc.string({ maxLength: 5 }), { nil: null }),
        fc.option(fc.string({ maxLength: 5 }), { nil: null }),
      ),
    });
    fc.assert(
      fc.property(fc.array(arbVariant, { maxLength: 5 }), (variants) => {
        const [p] = plan(
          product({
            variants: variants.map((v) => ({
              ...v,
              optionValues: [...v.optionValues] as SapoVariant['optionValues'],
            })),
          }),
        );
        const numbers = [
          p?.priceVnd,
          p?.stock,
          ...(p?.variants.flatMap((v) => [v.priceVnd, v.compareAtVnd, v.stock]) ?? []),
        ];
        for (const n of numbers) {
          expect(n === null || n === undefined || (Number.isInteger(n) && n >= 0)).toBe(true);
        }
      }),
    );
  });
});
