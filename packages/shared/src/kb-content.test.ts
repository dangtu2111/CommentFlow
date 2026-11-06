import { describe, expect, it } from 'vitest';
import {
  BRAND_VOICE_LIST_MAX,
  expandContentLang,
  HANDOFF_TOPICS,
  parseBrandVoice,
  parseFaqItem,
  parsePolicyItem,
  parseShopProfile,
} from './kb-content';

describe('FR-050 phạm vi ngôn ngữ của mục kiến thức', () => {
  it('"all" mở thành cả vi và en; vi/en giữ nguyên', () => {
    expect(expandContentLang('all')).toEqual(['vi', 'en']);
    expect(expandContentLang('vi')).toEqual(['vi']);
    expect(expandContentLang('en')).toEqual(['en']);
  });
});

describe('FR-050 thông tin cửa hàng', () => {
  it('chấp nhận hồ sơ tối thiểu, cắt khoảng trắng, chuỗi rỗng → null', () => {
    const r = parseShopProfile({ lang: 'vi', name: '  Shop A  ', address: '   ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('Shop A');
      expect(r.data.address).toBeNull();
    }
  });
  it('từ chối thiếu tên, ngôn ngữ lạ, website không phải http(s)', () => {
    expect(parseShopProfile({ lang: 'vi', name: '' }).success).toBe(false);
    expect(parseShopProfile({ lang: 'fr', name: 'A' }).success).toBe(false);
    expect(
      parseShopProfile({ lang: 'vi', name: 'A', website: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(parseShopProfile({ lang: 'vi', name: 'A', website: 'không phải url' }).success).toBe(
      false,
    );
    expect(parseShopProfile({ lang: 'vi', name: 'A', website: 'https://shop.vn' }).success).toBe(
      true,
    );
    const empty = parseShopProfile({ lang: 'en', name: 'A', website: '' });
    expect(empty.success && empty.data.website).toBeNull();
  });
});

describe('FR-050 chính sách', () => {
  const item = { kind: 'return', lang: 'vi', title: 'a', content: 'b' };
  it('kind hợp lệ, nội dung bắt buộc và có trần độ dài', () => {
    expect(parsePolicyItem({ ...item, lang: 'all', title: 'Đổi trả' }).success).toBe(true);
    expect(parsePolicyItem({ ...item, kind: 'x' }).success).toBe(false);
    expect(parsePolicyItem({ ...item, content: '' }).success).toBe(false);
    expect(parsePolicyItem({ ...item, content: 'x'.repeat(8001) }).success).toBe(false);
    expect(parsePolicyItem({ ...item, content: 'x'.repeat(8000) }).success).toBe(true);
  });
});

describe('FR-050 FAQ', () => {
  it('cần câu hỏi + trả lời; thẻ được chuẩn hóa (thường, bỏ trùng, bỏ rỗng)', () => {
    const r = parseFaqItem({
      question: 'Ship bao lâu?',
      answer: '2-3 ngày',
      lang: 'vi',
      tags: ['Ship', ' ship ', ''],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tags).toEqual(['ship']);
    expect(
      parseFaqItem({ question: 'q', answer: 'a', lang: 'vi', tags: ['x'.repeat(51)] }).success,
    ).toBe(false);
    expect(parseFaqItem({ question: '', answer: 'a', lang: 'vi' }).success).toBe(false);
    expect(parseFaqItem({ question: 'q', answer: ' ', lang: 'vi' }).success).toBe(false);
  });
});

describe('FR-050 FR-142 giọng văn + quy tắc', () => {
  const base = { lang: 'vi', shopPronoun: 'em', customerAddress: 'anh_chi' };
  it('xưng hô hợp lệ theo ngôn ngữ; en chỉ "you"', () => {
    expect(parseBrandVoice(base).success).toBe(true);
    expect(
      parseBrandVoice({ lang: 'en', shopPronoun: 'shop', customerAddress: 'you' }).success,
    ).toBe(true);
    expect(
      parseBrandVoice({ lang: 'en', shopPronoun: 'shop', customerAddress: 'anh_chi' }).success,
    ).toBe(false);
  });
  it('lang chỉ vi/en (không "all"); shop custom cần tên', () => {
    expect(parseBrandVoice({ ...base, lang: 'all' }).success).toBe(false);
    expect(parseBrandVoice({ ...base, shopPronoun: 'custom' }).success).toBe(false);
    expect(
      parseBrandVoice({ ...base, shopPronoun: 'custom', shopPronounCustom: 'Mình Linh' }).success,
    ).toBe(true);
    expect(parseBrandVoice({ ...base, shopPronounCustom: 'x' }).success).toBe(false);
  });
  it('quy tắc nên/không nên: bỏ rỗng, có trần số mục', () => {
    const r = parseBrandVoice({ ...base, doRules: ['Chào trước', ' '], dontRules: [] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.doRules).toEqual(['Chào trước']);
    const many = Array.from({ length: BRAND_VOICE_LIST_MAX + 1 }, (_, i) => `r${i}`);
    expect(parseBrandVoice({ ...base, doRules: many }).success).toBe(false);
  });
  it('câu mời chuyển người: chỉ chủ đề đã biết, mỗi chủ đề có bản trong/ngoài giờ', () => {
    expect(HANDOFF_TOPICS).toEqual([
      'shipping',
      'discount',
      'order_status',
      'stock_check',
      'other',
    ]);
    const ok = { shipping: { inHours: 'Em báo bạn bên em ạ', outHours: 'Ngoài giờ ạ' } };
    expect(parseBrandVoice({ ...base, handoffTemplates: ok }).success).toBe(true);
    expect(parseBrandVoice({ ...base, handoffTemplates: { weird: ok.shipping } }).success).toBe(
      false,
    );
    expect(
      parseBrandVoice({ ...base, handoffTemplates: { shipping: { inHours: 'a' } } }).success,
    ).toBe(false);
  });
});
