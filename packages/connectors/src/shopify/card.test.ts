import { CARD_VALUE_MAX, parseProductCard } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { buildShopifyCard, type ShopifyCardSource } from './card';

const source = (over: Partial<ShopifyCardSource> = {}): ShopifyCardSource => ({
  description: '',
  tags: [],
  productType: '',
  metafields: [],
  ...over,
});
const meta = (
  key: string,
  value: string,
  type = 'single_line_text_field',
  namespace = 'custom',
) => ({
  namespace,
  key,
  type,
  value,
});

describe('FR-058 buildShopifyCard — mô tả/tag/loại/metafield Shopify → thẻ sản phẩm', () => {
  it('không có gì → thẻ rỗng (không khóa thừa)', () => {
    expect(buildShopifyCard(source())).toEqual({});
  });

  it('loại, tag (bỏ trùng/rỗng, tối đa 20) và mô tả thuần văn bản', () => {
    const card = buildShopifyCard(
      source({
        productType: ' Áo ',
        tags: ['hè', ' hè ', '', 'nữ', ...Array.from({ length: 30 }, (_, i) => `t${i}`)],
        description: 'Áo thun   cotton\n\nmềm mại.',
      }),
    );
    expect(card.type).toBe('Áo');
    expect(card.description).toBe('Áo thun cotton mềm mại.');
    expect(card.tags).toHaveLength(20);
    expect(card.tags?.slice(0, 2)).toEqual(['hè', 'nữ']);
  });

  it('metafield custom.* → chất liệu/cách giặt/bảng size/bảo hành/xuất xứ (cả khóa tiếng Việt)', () => {
    const card = buildShopifyCard(
      source({
        metafields: [
          meta('material', '100% cotton'),
          meta('huong_dan_giat', 'Giặt tay, không vắt', 'multi_line_text_field'),
          meta('bang_size', 'S 40-50kg\nM 50-58kg', 'multi_line_text_field'),
          meta('bao_hanh', '7 ngày đổi size'),
          meta('xuat_xu', 'Việt Nam'),
        ],
      }),
    );
    expect(card).toEqual({
      material: '100% cotton',
      care: 'Giặt tay, không vắt',
      sizeChart: 'S 40-50kg M 50-58kg',
      warranty: '7 ngày đổi size',
      origin: 'Việt Nam',
    });
  });

  it('chỉ namespace custom và kiểu văn bản; kiểu khác/namespace khác bị bỏ', () => {
    const card = buildShopifyCard(
      source({
        metafields: [
          meta('material', 'bỏ', 'single_line_text_field', 'app_khac'),
          meta('origin', '123', 'number_integer'),
          meta('care', 'giữ', 'single_line_text_field'),
        ],
      }),
    );
    expect(card).toEqual({ care: 'giữ' });
  });

  it('rich_text_field (JSON) → chữ thuần; JSON hỏng → bỏ', () => {
    const rich = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Chất liệu' },
            { type: 'text', value: 'cotton' },
          ],
        },
        { type: 'paragraph', children: [{ type: 'text', value: 'mềm' }] },
      ],
    });
    expect(
      buildShopifyCard(source({ metafields: [meta('material', rich, 'rich_text_field')] }))
        .material,
    ).toBe('Chất liệu cotton mềm');
    expect(
      buildShopifyCard(source({ metafields: [meta('material', '{hỏng', 'rich_text_field')] })),
    ).toEqual({});
  });

  it('câu có số tiền bị loại (giá chỉ đọc từ kho sản phẩm — nguyên tắc #4), câu khác giữ', () => {
    const card = buildShopifyCard(
      source({
        description:
          'Áo cotton mềm. Giá chỉ 150.000đ hôm nay! Sale 99k. Giặt máy ok. Chỉ 120 USD. Nặng 5kg. Giảm $20.',
      }),
    );
    expect(card.description).toBe('Áo cotton mềm. Giặt máy ok. Nặng 5kg.');
  });

  it('mô tả toàn số tiền → không có khóa description; giá trị dài bị cắt ≤ 600 và hợp lệ với schema thẻ', () => {
    expect(buildShopifyCard(source({ description: 'Chỉ 99k thôi!' }))).toEqual({});
    const long = buildShopifyCard(source({ description: `${'từ '.repeat(400)}hết` }));
    expect((long.description ?? '').length).toBeLessThanOrEqual(CARD_VALUE_MAX);
    expect(long.description?.endsWith('…')).toBe(true);
    expect(parseProductCard(long).ok).toBe(true);
  });
});
