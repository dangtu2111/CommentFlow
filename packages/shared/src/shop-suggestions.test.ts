import { describe, expect, it } from 'vitest';
import {
  extractContactSuggestions,
  mergeContactText,
  shopifyShopToSuggestions,
} from './shop-suggestions';

describe('extractContactSuggestions (CODE tách, không qua LLM)', () => {
  const byField = (text: string) =>
    Object.fromEntries(
      extractContactSuggestions(text, { lang: 'vi', sourceRef: 'Giới thiệu' }).map((s) => [
        s.field,
        s,
      ]),
    );

  it('tách hotline, email, website, Zalo, Shopee, TikTok kèm trích dẫn nguyên văn', () => {
    const text = [
      'Hotline: 0901 234 567 (8h-21h)',
      'Email: cskh@shopa.vn',
      'Website: https://shopa.vn/gioi-thieu.',
      'Zalo: https://zalo.me/shopa',
      'Shopee: https://shopee.vn/shopa',
      'TikTok: https://www.tiktok.com/@shopa',
    ].join('\n');
    const r = byField(text);
    expect(r.hotline?.value).toBe('0901 234 567');
    expect(r.email?.value).toBe('cskh@shopa.vn');
    expect(r.website?.value).toBe('https://shopa.vn/gioi-thieu');
    expect(r.zalo?.value).toBe('https://zalo.me/shopa');
    expect(r.shopee?.value).toBe('https://shopee.vn/shopa');
    expect(r.tiktok?.value).toBe('https://www.tiktok.com/@shopa');
    for (const s of Object.values(r)) {
      expect(s.source).toBe('kb_text');
      expect(s.sourceRef).toBe('Giới thiệu');
      expect(text).toContain(s.evidenceQuote as string);
    }
    expect(r.hotline?.evidenceQuote).toBe('Hotline: 0901 234 567 (8h-21h)');
  });

  it('+84 và dấu chấm/gạch vẫn là số điện thoại; số ngắn, mã đơn, số tiền thì không', () => {
    expect(byField('Gọi +84 901.234.567 nhé').hotline?.value).toBe('+84 901.234.567');
    expect(byField('Mã đơn 123456, giá 199000đ, 12345678901234').hotline).toBeUndefined();
    expect(byField('Ship 30.000đ toàn quốc').hotline).toBeUndefined();
  });

  it('mã số thuế (10 số, đứng sau "mã số thuế"/MST) không bị nhận nhầm là hotline', () => {
    expect(byField('Mã số thuế 0312345678').hotline).toBeUndefined();
    expect(byField('MST: 0312345678\nHotline 0901234567').hotline?.value).toBe('0901234567');
  });

  it('chỉ lấy giá trị đầu tiên của mỗi trường; không có gì → rỗng', () => {
    expect(byField('0901234567 hoặc 0912345678').hotline?.value).toBe('0901234567');
    expect(extractContactSuggestions('Shop bán áo thun', { lang: 'vi' })).toEqual([]);
  });

  it('liên kết Zalo/Shopee/TikTok không viết thành "website"; dòng quá dài vẫn cắt trích dẫn ≤ 500 ký tự', () => {
    const r = byField('Mua tại https://shopee.vn/a và https://zalo.me/b');
    expect(r.website).toBeUndefined();
    expect(r.shopee?.value).toBe('https://shopee.vn/a');
    const long = `${'x '.repeat(400)}0901234567 ${'y '.repeat(400)}`;
    const q = byField(long).hotline?.evidenceQuote ?? '';
    expect(q.length).toBeLessThanOrEqual(500);
    expect(q).toContain('0901234567');
    expect(long).toContain(q);
  });
});

describe('shopifyShopToSuggestions', () => {
  it('tên, email liên hệ, tên miền chính, mô tả, địa chỉ → đề xuất nguồn shopify (không trích dẫn)', () => {
    const r = shopifyShopToSuggestions(
      {
        name: 'Shop A',
        contactEmail: 'a@shopa.vn',
        primaryDomainUrl: 'https://shopa.vn',
        description: 'Thời trang nam nữ',
        billingAddress: {
          address1: '1 Lê Lợi',
          city: 'Quận 1',
          province: 'TP.HCM',
          country: 'Việt Nam',
        },
      },
      'vi',
    );
    expect(Object.fromEntries(r.map((s) => [s.field, s.value]))).toEqual({
      name: 'Shop A',
      email: 'a@shopa.vn',
      website: 'https://shopa.vn',
      description: 'Thời trang nam nữ',
      address: '1 Lê Lợi, Quận 1, TP.HCM, Việt Nam',
    });
    expect(r.every((s) => s.source === 'shopify' && s.lang === 'vi')).toBe(true);
  });

  it('bỏ trường trống, mô tả có giá tiền hoặc quá 500 ký tự', () => {
    const r = shopifyShopToSuggestions(
      {
        name: 'Shop A',
        contactEmail: '  ',
        primaryDomainUrl: null,
        description: 'Áo chỉ 199k',
        billingAddress: null,
      },
      'vi',
    );
    expect(r.map((s) => s.field)).toEqual(['name']);
    expect(
      shopifyShopToSuggestions(
        {
          name: 'A',
          contactEmail: null,
          primaryDomainUrl: null,
          description: 'x'.repeat(501),
          billingAddress: null,
        },
        'vi',
      ).map((s) => s.field),
    ).toEqual(['name']);
  });
});

describe('mergeContactText', () => {
  it('trống → đặt giá trị; đã có → nối "; "; đã chứa → giữ nguyên; quá 200 ký tự → null', () => {
    expect(mergeContactText(null, '0901234567')).toBe('0901234567');
    expect(mergeContactText('  ', '0901234567')).toBe('0901234567');
    expect(mergeContactText('Zalo shop', 'a@shopa.vn')).toBe('Zalo shop; a@shopa.vn');
    expect(mergeContactText('Gọi 0901234567', '0901234567')).toBe('Gọi 0901234567');
    expect(mergeContactText('x'.repeat(195), 'a@shopa.vn')).toBeNull();
  });
});
