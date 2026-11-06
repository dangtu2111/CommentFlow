import { describe, expect, it } from 'vitest';
import { checkMapping, columnMappingSchema, suggestMapping } from './mapping';

describe('FR-051 khớp cột', () => {
  it('gợi ý từ tiêu đề vi/en, không dấu, hoa thường', () => {
    expect(
      suggestMapping([
        'Tên sản phẩm',
        'Mã SP',
        'SKU',
        'Giá bán',
        'Giá gốc',
        'Tồn kho',
        'Màu sắc',
        'Size',
        'Danh mục',
        'Link',
        'Ghi chú nội bộ',
      ]),
    ).toEqual([
      'productName',
      'productCode',
      'sku',
      'price',
      'compareAtPrice',
      'stock',
      'attribute',
      'attribute',
      'category',
      'url',
      'ignore',
    ]);
    expect(suggestMapping(['PRODUCT NAME', 'Price', 'Stock', 'Colour', 'Category'])).toEqual([
      'productName',
      'price',
      'stock',
      'attribute',
      'category',
    ]);
  });

  it('mỗi trường chỉ gán cho một cột (cột trùng tên đầu tiên thắng, cột sau bỏ qua); thuộc tính nhiều cột được', () => {
    expect(suggestMapping(['Tên', 'Tên sản phẩm', 'Màu', 'Size'])).toEqual([
      'productName',
      'ignore',
      'attribute',
      'attribute',
    ]);
  });

  it('tiêu đề rỗng hoặc lạ → bỏ qua', () => {
    expect(suggestMapping(['', 'xyz'])).toEqual(['ignore', 'ignore']);
  });

  it('kiểm khớp cột: cần cột tên; không trùng trường; số cột khớp tiêu đề', () => {
    expect(checkMapping(['productName', 'price', 'ignore'], 3)).toEqual({ ok: true });
    expect(checkMapping(['price'], 1)).toEqual({ ok: false, code: 'NAME_COLUMN_REQUIRED' });
    expect(checkMapping(['productName', 'productName'], 2)).toEqual({
      ok: false,
      code: 'DUPLICATE_FIELD',
    });
    expect(checkMapping(['productName', 'attribute', 'attribute'], 3)).toEqual({ ok: true });
    expect(checkMapping(['productName'], 2)).toEqual({ ok: false, code: 'LENGTH_MISMATCH' });
  });

  it('schema từ chối giá trị lạ và quá 50 cột', () => {
    expect(columnMappingSchema.safeParse(['productName', 'ignore']).success).toBe(true);
    expect(columnMappingSchema.safeParse(['__proto__']).success).toBe(false);
    expect(columnMappingSchema.safeParse(new Array(51).fill('ignore')).success).toBe(false);
  });
});
