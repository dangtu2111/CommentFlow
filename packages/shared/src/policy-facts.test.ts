import { describe, expect, it } from 'vitest';
import { parsePolicyFactData, policySlotOf } from './policy-facts';

const ship = {
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
  cod: true,
};

describe('parsePolicyFactData — kiểm dữ liệu chính sách có cấu trúc theo loại (ranh giới ghi)', () => {
  it('ship_region hợp lệ: toàn quốc, nội thành (bắt buộc ghi thành phố), vùng (có tỉnh)', () => {
    expect(parsePolicyFactData('ship_region', ship).success).toBe(true);
    expect(
      parsePolicyFactData('ship_region', {
        ...ship,
        kind: 'city',
        label: 'Nội thành',
        city: 'Hà Nội',
      }).success,
    ).toBe(true);
    expect(
      parsePolicyFactData('ship_region', {
        ...ship,
        kind: 'region',
        label: 'Miền Bắc',
        places: ['Hải Phòng'],
      }).success,
    ).toBe(true);
  });

  it('ship_region sai: nội thành thiếu thành phố, vùng không có tỉnh, ngày ngược, tiền âm/lẻ, tiền tệ sai dạng, nhãn rỗng', () => {
    const bad = (over: Record<string, unknown>) =>
      expect(parsePolicyFactData('ship_region', { ...ship, ...over }).success).toBe(false);
    bad({ kind: 'city', label: 'Nội thành' });
    bad({ kind: 'city', label: 'Nội thành', city: '   ' });
    bad({ kind: 'region', label: 'Vùng' });
    bad({ kind: 'region', label: 'Vùng', places: [] });
    bad({ daysMin: 5, daysMax: 2 });
    bad({ feeMinor: -1 });
    bad({ feeMinor: 1.5 });
    bad({ currency: 'vnd' });
    bad({ label: '' });
    bad({ extra: 'khóa lạ' });
  });

  it('thiếu phí/ngày hợp lệ (null = chưa khai, fact plan coi là unknown)', () => {
    expect(
      parsePolicyFactData('ship_region', {
        ...ship,
        feeMinor: null,
        daysMin: null,
        daysMax: null,
        cod: null,
      }).success,
    ).toBe(true);
  });

  it('cod / returns / warranty / payment', () => {
    expect(parsePolicyFactData('cod', { value: false }).success).toBe(true);
    expect(parsePolicyFactData('cod', { value: 'có' }).success).toBe(false);
    expect(parsePolicyFactData('returns', { days: 7 }).success).toBe(true);
    expect(parsePolicyFactData('returns', { days: 7, conditions: ['còn tem mác'] }).success).toBe(
      true,
    );
    expect(parsePolicyFactData('returns', { days: 7, conditions: [''] }).success).toBe(false);
    expect(
      parsePolicyFactData('warranty', { months: 3, scope: 'đường may', needsReview: true }).success,
    ).toBe(true);
    expect(parsePolicyFactData('warranty', { months: 3, scope: '' }).success).toBe(false);
    expect(parsePolicyFactData('returns', { days: null, none: true }).success).toBe(true);
    expect(parsePolicyFactData('returns', { days: 7, none: true }).success).toBe(false);
    expect(parsePolicyFactData('returns', { days: null }).success).toBe(false);
    expect(parsePolicyFactData('warranty', { months: 12 }).success).toBe(true);
    expect(parsePolicyFactData('warranty', { months: null, none: true }).success).toBe(true);
    expect(parsePolicyFactData('warranty', { months: -3 }).success).toBe(false);
    expect(parsePolicyFactData('payment', { methods: ['cod', 'bank_transfer'] }).success).toBe(
      true,
    );
    expect(parsePolicyFactData('payment', { methods: [] }).success).toBe(false);
    expect(parsePolicyFactData('payment', { methods: ['bitcoin'] }).success).toBe(false);
  });

  it('loại lạ → thất bại', () => {
    expect(parsePolicyFactData('unknown_kind', {}).success).toBe(false);
  });
});

describe('policySlotOf — định danh trong workspace', () => {
  it('ship_region theo nhãn chuẩn hóa (không dấu, chữ thường); loại khác theo chính loại', () => {
    expect(policySlotOf('ship_region', { label: '  Nội thành Hà Nội ' })).toBe('noi thanh ha noi');
    expect(policySlotOf('cod', {})).toBe('cod');
    expect(policySlotOf('returns', {})).toBe('returns');
  });

  it('nhãn quá dài bị cắt còn 100 ký tự', () => {
    expect(policySlotOf('ship_region', { label: 'a'.repeat(300) })).toHaveLength(100);
  });
});

describe('ship_region định tính (feeMode/daysMode/destinations)', () => {
  const base = {
    kind: 'nationwide',
    label: 'US',
    feeMinor: null,
    currency: 'USD',
    daysMin: null,
    daysMax: null,
  };
  it('fixed bắt buộc có số tiền; free_over bắt buộc có ngưỡng', () => {
    expect(parsePolicyFactData('ship_region', { ...base, feeMode: 'fixed' }).success).toBe(false);
    expect(
      parsePolicyFactData('ship_region', { ...base, feeMode: 'fixed', feeMinor: 3000 }).success,
    ).toBe(true);
    expect(parsePolicyFactData('ship_region', { ...base, feeMode: 'free_over' }).success).toBe(
      false,
    );
    expect(
      parsePolicyFactData('ship_region', { ...base, feeMode: 'free_over', freeOverMinor: null })
        .success,
    ).toBe(false);
    expect(
      parsePolicyFactData('ship_region', { ...base, feeMode: 'free_over', freeOverMinor: 5000 })
        .success,
    ).toBe(true);
  });
  it('at_checkout/free, daysMode, destinations ISO', () => {
    expect(
      parsePolicyFactData('ship_region', {
        ...base,
        feeMode: 'at_checkout',
        daysMode: 'at_checkout',
        destinations: ['US'],
      }).success,
    ).toBe(true);
    expect(parsePolicyFactData('ship_region', { ...base, feeMode: 'free' }).success).toBe(true);
    expect(parsePolicyFactData('ship_region', { ...base, destinations: ['usa'] }).success).toBe(
      false,
    );
    expect(parsePolicyFactData('ship_region', { ...base, destinations: [] }).success).toBe(false);
  });
});
