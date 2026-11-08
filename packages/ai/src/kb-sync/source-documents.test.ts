import { chunkDocument } from '@flow/shared';
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

  it('thẻ sản phẩm (card): chất liệu/bảng size/mô tả/tag vào tài liệu; câu có số tiền bị loại; vẫn không giá/tồn', () => {
    const [d] = buildProductDocuments(
      [
        {
          id: 'p1',
          name: 'Áo thun',
          sku: null,
          options: [],
          card: {
            material: 'Cotton 100%',
            sizeChart: 'S: 50-55kg; M: 56-62kg',
            description: 'Áo thoáng mát. Giá chỉ 199k hôm nay.',
            tags: ['mùa hè', 'basic'],
          },
        },
      ],
      'Sản phẩm',
    );
    expect(d?.text).toContain('Chất liệu: Cotton 100%');
    expect(d?.text).toContain('Bảng size: S: 50-55kg; M: 56-62kg');
    expect(d?.text).toContain('Mô tả: Áo thoáng mát.');
    expect(d?.text).toContain('Tag: mùa hè, basic');
    expect(d?.text).not.toMatch(/199|giá/i);
    // Câu hỏi chất liệu/kích thước tìm được trong đoạn có context_header "Sản phẩm › tên" và gắn product_id.
    const chunks = chunkDocument(d as NonNullable<typeof d>);
    expect(chunks[0]?.contextHeader).toBe('Sản phẩm › Áo thun');
    expect(chunks[0]?.productId).toBe('p1');
    expect(chunks.map((c) => c.content).join(' ')).toMatch(/Cotton 100%[\s\S]*50-55kg/);
  });

  it('thẻ dài → vài đoạn, MỌI đoạn đều giữ product_id và header', () => {
    const long = 'Nội dung chi tiết khá dài của thẻ sản phẩm. '.repeat(8).trim();
    const [d] = buildProductDocuments(
      [
        {
          id: 'p2',
          name: 'Váy',
          sku: null,
          options: [],
          card: { material: long, care: long, sizeChart: long, description: long, warranty: long },
        },
      ],
      'Sản phẩm',
    );
    const chunks = chunkDocument(d as NonNullable<typeof d>);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.productId === 'p2' && c.contextHeader === 'Sản phẩm › Váy')).toBe(
      true,
    );
  });
});
