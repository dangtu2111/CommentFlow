import { describe, expect, it } from 'vitest';
import { buildImportPlan } from './plan';
import type { ImportRecord } from './validate';

const rec = (over: Partial<ImportRecord>): ImportRecord => ({
  row: 2,
  productKey: 'ao thun',
  productName: 'Áo thun',
  productCode: null,
  category: null,
  url: null,
  sku: null,
  attrs: {},
  priceVnd: null,
  compareAtVnd: null,
  stock: null,
  ...over,
});

describe('FR-051 gom dòng thành sản phẩm + biến thể', () => {
  it('gom theo khóa sản phẩm, giữ thứ tự xuất hiện; giá thấp nhất, tồn = tổng khi biết hết', () => {
    const plan = buildImportPlan([
      rec({ sku: 'AT-D-M', attrs: { Màu: 'Đen', Size: 'M' }, priceVnd: 150000, stock: 3 }),
      rec({
        row: 3,
        sku: 'AT-T-M',
        attrs: { Màu: 'Trắng', Size: 'M' },
        priceVnd: 120000,
        compareAtVnd: 200000,
        stock: 4,
      }),
      rec({ row: 4, productKey: 'quan', productName: 'Quần', priceVnd: 99000, stock: 0 }),
    ]);
    expect(plan.map((p) => p.externalId)).toEqual(['ao thun', 'quan']);
    const [ao, quan] = plan;
    expect(ao).toMatchObject({
      name: 'Áo thun',
      priceVnd: 120000,
      compareAtVnd: 200000,
      stock: 7,
    });
    expect(ao?.variants.map((v) => v.externalId)).toEqual(['sku:AT-D-M', 'sku:AT-T-M']);
    expect(ao?.variants[0]).toMatchObject({
      sku: 'AT-D-M',
      attrs: { Màu: 'Đen', Size: 'M' },
      attrsNorm: { color: 'black', size: 'm' },
      priceVnd: 150000,
      stock: 3,
    });
    expect(quan?.variants[0]?.externalId).toBe('default');
    expect(quan?.stock).toBe(0);
  });

  it('tồn của sản phẩm là null khi có biến thể chưa biết tồn; giá null khi không biến thể nào có giá', () => {
    const [p] = buildImportPlan([
      rec({ sku: 'A', stock: 3 }),
      rec({ row: 3, sku: 'B', stock: null }),
    ]);
    expect(p?.stock).toBeNull();
    expect(p?.priceVnd).toBeNull();
    expect(p?.compareAtVnd).toBeNull();
  });

  it('khóa biến thể không SKU = chữ ký thuộc tính đã chuẩn hóa, không phụ thuộc thứ tự cột', () => {
    const [a] = buildImportPlan([rec({ attrs: { Size: 'M', Màu: 'Đen' } })]);
    const [b] = buildImportPlan([rec({ attrs: { màu: 'đen', size: 'm' } })]);
    expect(a?.variants[0]?.externalId).toBe('attrs:color=black|size=m');
    expect(b?.variants[0]?.externalId).toBe(a?.variants[0]?.externalId);
  });

  it('tên/danh mục/link lấy từ dòng đầu của sản phẩm có giá trị; search_text gồm tên, SKU, thuộc tính (không giá/tồn)', () => {
    const [p] = buildImportPlan([
      rec({ sku: 'S1', attrs: { Màu: 'Đen' }, priceVnd: 123456, stock: 9 }),
      rec({ row: 3, sku: 'S2', category: 'Áo', url: 'https://shop.example/a' }),
    ]);
    expect(p).toMatchObject({ category: 'Áo', url: 'https://shop.example/a' });
    expect(p?.searchText).toContain('ao thun');
    expect(p?.searchText).toContain('s1');
    expect(p?.searchText).toContain('black');
    expect(p?.searchText).not.toContain('123456');
    expect(p?.variantsSnapshot).toHaveLength(2);
  });

  it('không có bản ghi → kế hoạch rỗng', () => {
    expect(buildImportPlan([])).toEqual([]);
  });
});
