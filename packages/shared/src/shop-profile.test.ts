import { describe, expect, it } from 'vitest';
import {
  SHOP_BRANCHES_MAX,
  shopBranchesSchema,
  shopContactsSchema,
  shopHoursSchema,
  shopIndustriesSchema,
  shopProfileV2Schema,
  shopSuggestionInsertSchema,
} from './shop-profile';

const branch = (over: Record<string, unknown> = {}) => ({
  name: 'Chi nhánh 1',
  address: '128 Nguyễn Trãi, Quận 1',
  is_main: false,
  ...over,
});

describe('KB-SHOP-V2: thông tin cửa hàng v2', () => {
  it('giờ mở cửa: ngày 1–7 không trùng, giờ HH:MM; sai định dạng bị từ chối', () => {
    expect(
      shopHoursSchema.safeParse({
        open: { days: [1, 2, 3, 4, 5], from: '08:30', to: '21:30' },
        support: { from: '08:00', to: '23:00' },
      }).success,
    ).toBe(true);
    for (const bad of [
      { open: { days: [], from: '08:30', to: '21:30' } },
      { open: { days: [1, 1], from: '08:30', to: '21:30' } },
      { open: { days: [8], from: '08:30', to: '21:30' } },
      { open: { days: [1], from: '8:30', to: '21:30' } },
      { open: { days: [1], from: '08:30', to: '24:00' } },
      { extra: 1 },
    ]) {
      expect(shopHoursSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('kênh liên hệ: chỉ 5 khóa, ≤ 500 ký tự, không số tiền', () => {
    expect(
      shopContactsSchema.safeParse({ hotline: '1900 6868', zalo: 'https://zalo.me/shop' }).success,
    ).toBe(true);
    expect(shopContactsSchema.safeParse({ facebook: 'x' }).success).toBe(false);
    expect(shopContactsSchema.safeParse({ website: 'a'.repeat(501) }).success).toBe(false);
    expect(shopContactsSchema.safeParse({ hotline: 'Phí gọi 20.000đ' }).success).toBe(false);
  });

  it('chi nhánh: tối đa 10, tối đa một chi nhánh chính, không số tiền, địa chỉ bắt buộc', () => {
    const ten = Array.from({ length: SHOP_BRANCHES_MAX }, (_, i) => branch({ name: `CN ${i}` }));
    expect(shopBranchesSchema.safeParse(ten).success).toBe(true);
    expect(shopBranchesSchema.safeParse([...ten, branch()]).success).toBe(false);
    expect(
      shopBranchesSchema.safeParse([branch({ is_main: true }), branch({ is_main: true })]).success,
    ).toBe(false);
    expect(shopBranchesSchema.safeParse([branch({ note: 'Gửi xe 5k' })]).success).toBe(false);
    expect(shopBranchesSchema.safeParse([branch({ address: '' })]).success).toBe(false);
    // số trần trong địa chỉ (số nhà) là hợp lệ
    expect(shopBranchesSchema.safeParse([branch({ address: '45 Cầu Giấy, Hà Nội' })]).success).toBe(
      true,
    );
  });

  it('ngành hàng: tối đa 10, tổng ≤ 500 ký tự', () => {
    expect(shopIndustriesSchema.safeParse(['Thời trang nữ', 'Phụ kiện']).success).toBe(true);
    expect(
      shopIndustriesSchema.safeParse(Array.from({ length: 11 }, (_, i) => `n${i}`)).success,
    ).toBe(false);
    expect(
      shopIndustriesSchema.safeParse(Array.from({ length: 6 }, () => 'a'.repeat(100))).success,
    ).toBe(false);
  });

  it('hồ sơ v2: trường để trống = null; thêm khóa lạ bị từ chối', () => {
    const ok = {
      slogan: null,
      industries: [],
      legalName: null,
      taxId: null,
      hours: null,
      contacts: null,
      branches: [],
    };
    expect(shopProfileV2Schema.safeParse(ok).success).toBe(true);
    expect(shopProfileV2Schema.safeParse({ ...ok, price: 1 }).success).toBe(false);
  });

  it('đề xuất: nguồn kb_text bắt buộc trích dẫn; không số tiền; trường lạ bị từ chối', () => {
    const base = { lang: 'vi', field: 'zalo', value: 'https://zalo.me/shop', source: 'shopify' };
    expect(shopSuggestionInsertSchema.safeParse(base).success).toBe(true);
    expect(shopSuggestionInsertSchema.safeParse({ ...base, source: 'kb_text' }).success).toBe(
      false,
    );
    expect(
      shopSuggestionInsertSchema.safeParse({
        ...base,
        source: 'kb_text',
        evidenceQuote: 'Zalo: shop',
      }).success,
    ).toBe(true);
    expect(shopSuggestionInsertSchema.safeParse({ ...base, value: 'Ship 30.000đ' }).success).toBe(
      false,
    );
    expect(shopSuggestionInsertSchema.safeParse({ ...base, field: 'price' }).success).toBe(false);
    expect(shopSuggestionInsertSchema.safeParse({ ...base, value: '' }).success).toBe(false);
  });
});
