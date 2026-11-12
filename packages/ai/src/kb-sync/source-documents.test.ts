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

  it('shop v2: khẩu hiệu, ngành, pháp lý, giờ, Zalo/Shopee/TikTok và chi nhánh vào đoạn kiến thức (trả lời "ở đâu, mấy giờ, Zalo gì")', () => {
    const [d] = buildShopDocuments(
      [
        {
          lang: 'vi',
          name: 'Shop A',
          description: null,
          address: '1 Lê Lợi, Q1',
          openingHours: null,
          contact: null,
          website: null,
          slogan: 'Đẹp mỗi ngày',
          industries: ['Thời trang', 'Phụ kiện'],
          legalName: 'Công ty TNHH A',
          taxId: '0312345678',
          hours: {
            open: { days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '21:00' },
            support: { from: '08:00', to: '22:00' },
          },
          contacts: { hotline: '0900000000', zalo: 'zalo.me/shopa', shopee: 'shopee.vn/shopa' },
          branches: [
            { name: 'Cơ sở 2', address: '2 Hai Bà Trưng', hours: '9-18h', is_main: false },
            { name: 'Trụ sở', address: '1 Lê Lợi', note: 'Có chỗ đậu xe', is_main: true },
          ],
        },
      ],
      'Thông tin shop',
    );
    const text = d?.text ?? '';
    expect(text).toContain('Khẩu hiệu: Đẹp mỗi ngày');
    expect(text).toContain('Ngành hàng: Thời trang, Phụ kiện');
    expect(text).toContain('Tên pháp lý: Công ty TNHH A');
    expect(text).toContain('Mã số thuế: 0312345678');
    expect(text).toContain('Lịch mở cửa: T2–T7, 08:00–21:00');
    expect(text).toContain('Giờ hỗ trợ online: 08:00–22:00');
    expect(text).toContain('Hotline: 0900000000');
    expect(text).toContain('Zalo: zalo.me/shopa');
    expect(text).toContain('Shopee: shopee.vn/shopa');
    expect(text).not.toContain('TikTok');
    // Chi nhánh chính đứng trước, có nhãn.
    expect(text.indexOf('Chi nhánh chính: Trụ sở')).toBeLessThan(
      text.indexOf('Chi nhánh: Cơ sở 2'),
    );
    expect(text).toContain('Chi nhánh chính: Trụ sở — 1 Lê Lợi — Ghi chú: Có chỗ đậu xe');
    expect(text).toContain('Chi nhánh: Cơ sở 2 — 2 Hai Bà Trưng — Giờ: 9-18h');
  });

  it('shop v2: ngày không liền nhau liệt kê từng ngày; chủ nhật là CN; chỉ có v2 vẫn tạo tài liệu', () => {
    const [d] = buildShopDocuments(
      [
        {
          lang: 'vi',
          name: 'Shop A',
          description: null,
          address: null,
          openingHours: null,
          contact: null,
          website: null,
          hours: { open: { days: [2, 4, 7], from: '10:00', to: '20:00' } },
        },
      ],
      'Thông tin shop',
    );
    expect(d?.text).toBe('Lịch mở cửa: T3, T5, CN, 10:00–20:00');
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
