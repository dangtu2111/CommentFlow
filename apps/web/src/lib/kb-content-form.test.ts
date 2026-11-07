import { describe, expect, it } from 'vitest';
import {
  formToBrandVoice,
  formToFaq,
  formToPolicy,
  formToShopProfile,
  splitLines,
  splitTags,
} from './kb-content-form';

const form = (entries: Record<string, string | string[]>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
};

describe('splitLines / splitTags', () => {
  it('cắt theo dòng, bỏ dòng trống và khoảng trắng thừa', () => {
    expect(splitLines(' a \n\n b\r\nc ')).toEqual(['a', 'b', 'c']);
    expect(splitLines('')).toEqual([]);
    expect(splitLines(null)).toEqual([]);
  });

  it('thẻ cách nhau bằng dấu phẩy, bỏ trống', () => {
    expect(splitTags('ship, Đổi trả ,, ')).toEqual(['ship', 'Đổi trả']);
    expect(splitTags(null)).toEqual([]);
  });
});

describe('formToShopProfile', () => {
  it('hợp lệ → input đã chuẩn hóa (trường trống → null)', () => {
    const r = formToShopProfile(form({ lang: 'vi', name: '  Shop A ', website: 'https://a.vn' }));
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.input).toMatchObject({
        lang: 'vi',
        name: 'Shop A',
        website: 'https://a.vn',
        address: null,
      });
  });

  it('thiếu tên hoặc website không phải http(s) → lỗi', () => {
    expect(formToShopProfile(form({ lang: 'vi', name: '' })).ok).toBe(false);
    expect(
      formToShopProfile(form({ lang: 'vi', name: 'A', website: 'javascript:alert(1)' })).ok,
    ).toBe(false);
  });

  it('ngôn ngữ lạ → lỗi', () => {
    expect(formToShopProfile(form({ lang: 'fr', name: 'A' })).ok).toBe(false);
  });
});

describe('formToPolicy', () => {
  it('hợp lệ / thiếu nội dung / loại lạ', () => {
    expect(
      formToPolicy(form({ kind: 'return', lang: 'all', title: 'Đổi trả', content: '7 ngày' })).ok,
    ).toBe(true);
    expect(
      formToPolicy(form({ kind: 'return', lang: 'all', title: 'Đổi trả', content: ' ' })).ok,
    ).toBe(false);
    expect(formToPolicy(form({ kind: 'bay', lang: 'all', title: 'x', content: 'y' })).ok).toBe(
      false,
    );
  });
});

describe('formToFaq', () => {
  it('thẻ tách bằng dấu phẩy, bỏ trùng, chữ thường', () => {
    const r = formToFaq(
      form({ question: 'Ship?', answer: '2 ngày', lang: 'vi', tags: 'Ship, ship, ĐỔI TRẢ' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.tags).toEqual(['ship', 'đổi trả']);
  });

  it('thiếu câu hỏi → lỗi', () => {
    expect(formToFaq(form({ question: '', answer: 'x', lang: 'vi' })).ok).toBe(false);
  });
});

describe('formToBrandVoice', () => {
  const base = { lang: 'vi', shopPronoun: 'em', customerAddress: 'anh_chi' };

  it('quy tắc nhập theo dòng; công tắc tick → true', () => {
    const r = formToBrandVoice(
      form({
        ...base,
        tone: 'thân thiện',
        doRules: 'chào khách\nxưng em',
        dontRules: '',
        addressByName: 'on',
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.doRules).toEqual(['chào khách', 'xưng em']);
      expect(r.input.addressByName).toBe(true);
    }
  });

  it('câu mời chuyển người: chỉ nhận chủ đề hợp lệ có đủ hai câu; ô trống bị bỏ qua', () => {
    const r = formToBrandVoice(
      form({
        ...base,
        'handoff.shipping.inHours': 'Em chuyển bạn ạ',
        'handoff.shipping.outHours': 'Sáng mai em báo',
        'handoff.discount.inHours': 'chỉ có một câu',
        'handoff.discount.outHours': '',
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.input.handoffTemplates)).toEqual(['shipping']);
  });

  it('xưng hô sai theo ngôn ngữ → lỗi (tiếng Anh chỉ có you)', () => {
    expect(
      formToBrandVoice(form({ lang: 'en', shopPronoun: 'shop', customerAddress: 'anh_chi' })).ok,
    ).toBe(false);
    expect(
      formToBrandVoice(form({ lang: 'en', shopPronoun: 'shop', customerAddress: 'you' })).ok,
    ).toBe(true);
  });

  it('shop = custom cần tên shop', () => {
    expect(formToBrandVoice(form({ ...base, shopPronoun: 'custom' })).ok).toBe(false);
    expect(
      formToBrandVoice(form({ ...base, shopPronoun: 'custom', shopPronounCustom: 'Mai' })).ok,
    ).toBe(true);
  });
});
