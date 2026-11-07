import { describe, expect, it } from 'vitest';
import { variantOptionsOf } from './kb-content';

describe('KB-PRODUCT-PREVIEW variantOptionsOf', () => {
  it('gom giá trị khác nhau theo tên thuộc tính, giữ thứ tự gặp, bỏ trùng', () => {
    const variants = [
      { sku: 'A', attrs: { Size: 'S', Màu: 'Đen' } },
      { sku: 'B', attrs: { Size: 'M', Màu: 'Đen' } },
      { sku: 'C', attrs: { Size: 'L', Màu: 'Trắng' } },
    ];
    expect(variantOptionsOf(variants)).toEqual([
      { name: 'Size', values: ['S', 'M', 'L'] },
      { name: 'Màu', values: ['Đen', 'Trắng'] },
    ]);
  });

  it('không có thuộc tính / dữ liệu lạ → rỗng, không ném lỗi', () => {
    expect(variantOptionsOf([{ sku: 'A', attrs: {} }])).toEqual([]);
    expect(variantOptionsOf(null)).toEqual([]);
    expect(variantOptionsOf('x')).toEqual([]);
    expect(variantOptionsOf([null, { attrs: { Size: 5 } }, { attrs: { Size: ' ' } }])).toEqual([]);
  });
});
