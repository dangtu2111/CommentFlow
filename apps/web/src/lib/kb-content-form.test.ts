import { describe, expect, it } from 'vitest';
import {
  formToBrandVoice,
  formToFaq,
  formToPolicy,
  formToShopProfile,
  formToShopProfileV2,
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

describe('formToShopProfileV2', () => {
  const ok = (entries: Record<string, string | string[]>) => {
    const r = formToShopProfileV2(form(entries));
    if (!r.ok) throw new Error('phải hợp lệ');
    return r.input;
  };

  it('form trống → toàn bộ trường mới rỗng (xóa được)', () => {
    expect(ok({})).toEqual({
      slogan: null,
      industries: [],
      legalName: null,
      taxId: null,
      hours: null,
      contacts: null,
      branches: [],
    });
  });

  it('đủ trường: ngành tách bằng phẩy, ngày số 1–7, giờ HH:MM, Zalo/Shopee/TikTok, chi nhánh + chi nhánh chính', () => {
    const v = ok({
      slogan: ' Đẹp mỗi ngày ',
      industries: 'Thời trang, Phụ kiện ,,',
      legalName: 'Công ty A',
      taxId: '0312345678',
      openDays: ['1', '2', '3'],
      openFrom: '08:00',
      openTo: '21:00',
      supportFrom: '08:00',
      supportTo: '22:00',
      zalo: 'zalo.me/a',
      shopee: '',
      tiktok: 'tiktok.com/@a',
      'branchName.0': 'Trụ sở',
      'branchAddress.0': '1 Lê Lợi',
      'branchName.1': '',
      'branchAddress.1': '',
      'branchName.2': 'Cơ sở 2',
      'branchAddress.2': '2 Hai Bà Trưng',
      'branchHours.2': '9-18h',
      'branchNote.2': 'Gần chợ',
      branchMain: '2',
    });
    expect(v.slogan).toBe('Đẹp mỗi ngày');
    expect(v.industries).toEqual(['Thời trang', 'Phụ kiện']);
    expect(v.hours).toEqual({
      open: { days: [1, 2, 3], from: '08:00', to: '21:00' },
      support: { from: '08:00', to: '22:00' },
    });
    expect(v.contacts).toEqual({ zalo: 'zalo.me/a', tiktok: 'tiktok.com/@a' });
    // Dòng trống bị bỏ; chỉ số chi nhánh chính theo dòng form (2), không theo vị trí sau khi bỏ dòng trống.
    expect(v.branches).toEqual([
      { name: 'Trụ sở', address: '1 Lê Lợi', is_main: false },
      {
        name: 'Cơ sở 2',
        address: '2 Hai Bà Trưng',
        hours: '9-18h',
        note: 'Gần chợ',
        is_main: true,
      },
    ]);
  });

  it('chỉ có giờ mở cửa thiếu ngày/giờ, giờ sai định dạng, ngày ngoài 1–7 → lỗi', () => {
    const bad = (e: Record<string, string | string[]>) => formToShopProfileV2(form(e)).ok;
    expect(bad({ openFrom: '08:00', openTo: '21:00' })).toBe(false);
    expect(bad({ openDays: ['1'], openFrom: '8h', openTo: '21:00' })).toBe(false);
    expect(bad({ openDays: ['8'], openFrom: '08:00', openTo: '21:00' })).toBe(false);
    expect(bad({ supportFrom: '08:00' })).toBe(false);
  });

  it('chi nhánh thiếu tên hoặc địa chỉ, quá 10 chi nhánh, giá tiền trong trường → lỗi', () => {
    const bad = (e: Record<string, string | string[]>) => formToShopProfileV2(form(e)).ok;
    expect(bad({ 'branchName.0': 'A' })).toBe(false);
    expect(bad({ 'branchAddress.0': '1 Lê Lợi' })).toBe(false);
    const eleven: Record<string, string> = {};
    for (let i = 0; i < 11; i += 1) {
      eleven[`branchName.${i}`] = `CN ${i}`;
      eleven[`branchAddress.${i}`] = `${i} Lê Lợi`;
    }
    expect(bad(eleven)).toBe(false);
    expect(bad({ slogan: 'Giảm còn 199k' })).toBe(false);
  });
});
