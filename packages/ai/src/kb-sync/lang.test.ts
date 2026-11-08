import { describe, expect, it } from 'vitest';
import { detectChunkLang } from './lang';
import { buildPolicyDocuments } from './policy-documents';
import { buildFaqDocuments, buildProductDocuments, buildShopDocuments } from './source-documents';

describe('detectChunkLang — ngôn ngữ THẬT của đoạn (không ép "all" thành vi)', () => {
  it('chính sách tiếng Anh khai "all" → en; tiếng Việt khai "all" → vi', () => {
    expect(
      detectChunkLang(
        'Thank you for shopping with us. Orders are processed within 1-3 business days and shipped from our warehouse.',
        'all',
      ),
    ).toBe('en');
    expect(
      detectChunkLang('Đổi trả trong 7 ngày nếu sản phẩm còn tem mác và chưa giặt.', 'all'),
    ).toBe('vi');
  });

  it('văn bản quá ngắn/không đoán được → theo ngôn ngữ đã khai (all → vi)', () => {
    expect(detectChunkLang('12345', 'en')).toBe('en');
    expect(detectChunkLang('12345', 'all')).toBe('vi');
    expect(detectChunkLang('12345', 'vi')).toBe('vi');
  });
});

describe('các bộ dựng tài liệu dùng ngôn ngữ thật', () => {
  it('chính sách "all" tiếng Anh thành tài liệu lang en', () => {
    const [d] = buildPolicyDocuments(
      [
        {
          id: 'p1',
          kind: 'shipping',
          lang: 'all',
          title: 'Shipping',
          content:
            'Orders are processed within 1-3 business days. We ship worldwide from our warehouse.',
        },
      ],
      'Chính sách cửa hàng',
    );
    expect(d?.doc.lang).toBe('en');
  });

  it('FAQ / thông tin shop khai all theo nội dung', () => {
    const [f] = buildFaqDocuments(
      [
        {
          id: 'f1',
          lang: 'all',
          question: 'Do you ship to Canada?',
          answer: 'Yes, we ship to Canada and the US.',
        },
      ],
      'FAQ',
    );
    expect(f?.lang).toBe('en');
    const [s] = buildShopDocuments(
      [
        {
          lang: 'all',
          name: 'Shop',
          description: 'Cửa hàng thời trang nam nữ với nhiều mẫu mới mỗi tuần',
          address: null,
          openingHours: null,
          contact: null,
          website: null,
        },
      ],
      'Thông tin shop',
    );
    expect(s?.lang).toBe('vi');
  });

  it('sản phẩm: nhận ngôn ngữ từ TÊN + thẻ (không phải nhãn tiếng Việt "Sản phẩm:" ta tự thêm)', () => {
    const [p] = buildProductDocuments(
      [
        {
          id: 'p1',
          name: 'Thank you gift box for your pets',
          sku: null,
          options: [],
          card: { description: 'This is a gift box that you can use for your dog and your cat.' },
        },
      ],
      'Sản phẩm',
    );
    expect(p?.lang).toBe('en');
  });
});
