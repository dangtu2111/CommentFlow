import { describe, expect, it } from 'vitest';
import { buildFaqDocuments, buildProductDocuments, buildShopDocuments } from './source-documents';

describe('tài liệu từ FAQ / shop / sản phẩm', () => {
  it('FAQ giữ nguyên cặp Hỏi/Đáp, lang all → vi', () => {
    const [d] = buildFaqDocuments(
      [{ id: 'f1', lang: 'all', question: 'Có ship COD không?', answer: 'Có.' }],
      'FAQ',
    );
    expect(d).toMatchObject({
      key: 'faq:f1',
      kind: 'faq',
      lang: 'vi',
      text: 'Hỏi: Có ship COD không?\nĐáp: Có.',
    });
  });

  it('shop: bỏ trường rỗng; hồ sơ rỗng hoàn toàn → không có tài liệu', () => {
    const base = {
      lang: 'vi' as const,
      name: 'Shop A',
      description: null,
      address: null,
      openingHours: null,
      contact: null,
      website: null,
    };
    expect(buildShopDocuments([base], 'Thông tin shop')).toEqual([]);
    const [d] = buildShopDocuments(
      [{ ...base, address: '1 Lê Lợi', openingHours: '8-17h' }],
      'Thông tin shop',
    );
    expect(d?.text).toBe('Địa chỉ: 1 Lê Lợi\n\nGiờ mở cửa: 8-17h');
  });

  it('sản phẩm: chỉ tên/mã/tùy chọn, KHÔNG có giá hay tồn', () => {
    const [d] = buildProductDocuments(
      [
        {
          id: 'p1',
          name: 'Áo thun',
          sku: 'AT-1',
          options: [
            { name: 'Size', values: ['S', 'M'] },
            { name: 'Màu', values: [] },
          ],
        },
      ],
      'Sản phẩm',
    );
    expect(d?.text).toBe('Sản phẩm: Áo thun\nMã: AT-1\nTùy chọn: Size: S, M');
    expect(d?.productId).toBe('p1');
    expect(d?.text).not.toMatch(/giá|tồn/i);
  });
});
