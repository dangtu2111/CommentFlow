import type { TryProduct } from '@flow/db/runtime';
import { describe, expect, it } from 'vitest';
import { missingAxesOf, productFactText } from './db-product-knowledge';
import { mentionsOfProducts } from './demo-ai';

const variant = (
  attrsNorm: Record<string, string>,
  priceVnd: number | null,
  stock: number | null,
) => ({
  attrs: attrsNorm,
  attrsNorm,
  priceVnd,
  stock,
});

const shirt: TryProduct = {
  id: 'p1',
  name: 'Áo thun basic',
  priceVnd: 150000,
  stock: 12,
  variants: [
    variant({ size: 'm', color: 'black' }, 150000, 5),
    variant({ size: 'l', color: 'black' }, 160000, 0),
    variant({ size: 'm', color: 'white' }, 150000, 7),
  ],
};

describe('TRY-AI-REAL lát A — sản phẩm thật', () => {
  it('missingAxesOf: chỉ trục có nhiều lựa chọn', () => {
    expect(missingAxesOf(shirt)).toEqual(['size', 'color']);
    expect(missingAxesOf({ ...shirt, variants: [variant({ size: 'm' }, 1, 1)] })).toEqual([]);
    expect(missingAxesOf({ ...shirt, variants: [] })).toEqual([]);
  });

  it('productFactText: mọi số đều lấy từ dữ liệu, hết hàng ghi rõ', () => {
    const text = productFactText(shirt);
    expect(text).toContain('Áo thun basic: giá 150.000đ');
    expect(text).toContain('size l, color black giá 160.000đ hết hàng');
    expect(text).toContain('còn 5');
  });

  it('productFactText: sản phẩm không biến thể thật / không giá không bịa số', () => {
    expect(
      productFactText({ id: 'p', name: 'Thẻ quà tặng', priceVnd: null, stock: null, variants: [] }),
    ).toBe('Thẻ quà tặng: chưa có giá.');
    expect(
      productFactText({
        id: 'p',
        name: 'Túi',
        priceVnd: 99000,
        stock: 3,
        variants: [variant({}, 99000, 3)],
      }),
    ).toBe('Túi: giá 99.000đ; còn 3.');
  });

  it('FR-058 productFactText: thẻ sản phẩm thành chi tiết có nhãn; câu có số tiền trong thẻ bị loại; không thẻ → như cũ', () => {
    const withCard = productFactText({
      ...shirt,
      card: {
        material: '100% cotton',
        care: 'Giặt tay',
        sizeChart: 'M 50-58kg',
        warranty: 'Đổi size 7 ngày',
        origin: 'Việt Nam',
        description: 'Áo mềm. Giá chỉ 99k hôm nay!',
        type: 'Áo',
        tags: ['hè'],
      },
    });
    expect(withCard).toContain(
      'Chi tiết: chất liệu 100% cotton; cách giặt Giặt tay; bảng size M 50-58kg;',
    );
    expect(withCard).toContain('bảo hành Đổi size 7 ngày; xuất xứ Việt Nam; mô tả Áo mềm.');
    expect(withCard).not.toContain('99k');
    expect(withCard.startsWith(productFactText(shirt).replace(/\.$/, ''))).toBe(true);
    expect(productFactText({ ...shirt, card: {} })).toBe(productFactText(shirt));
  });

  it('mentionsOfProducts: tên trọn vẹn, tên gần đúng, không liên quan', () => {
    const names = ['Áo thun basic', 'Váy hoa nhí vintage', 'Túi'];
    expect(mentionsOfProducts('Áo thun basic giá bao nhiêu?', names)).toEqual(['Áo thun basic']);
    expect(mentionsOfProducts('cho hỏi vay hoa nhi con khong', names)).toEqual([
      'Váy hoa nhí vintage',
    ]);
    expect(mentionsOfProducts('phí ship bao nhiêu', names)).toEqual([]);
    // Khách gõ tên RÚT GỌN của sản phẩm có tên rất dài vẫn nhận ra đúng sản phẩm.
    const long = [
      '10/20 Sheets Tear-Off Dishwashing Cloths Thickened Absorbent Disposable Dishcloth Kitchen Rag, Home Use',
      '100pcs Disposable Stretch Food Covers for Bowls and Plates',
    ];
    expect(
      mentionsOfProducts('10/20 Sheets Tear-Off Dishwashing Cloths còn hàng không?', long),
    ).toEqual([long[0]]);
    expect(
      mentionsOfProducts('100pcs Disposable Stretch Food Covers giá bao nhiêu?', long),
    ).toEqual([long[1]]);
    expect(mentionsOfProducts('Bao nhiêu vậy shop?', long)).toEqual([]);
  });
});
