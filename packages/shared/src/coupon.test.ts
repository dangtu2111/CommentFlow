import { describe, expect, it } from 'vitest';
import {
  type CouponRule,
  canManagePlansCoupons,
  canViewCoupons,
  evaluateCoupon,
  normalizeCouponCode,
  parseCouponInput,
  parseCouponUpdate,
  parsePlanUpdate,
} from './coupon';

const NOW = new Date('2026-11-10T00:00:00Z');
const baseRule: CouponRule = {
  product: 'commentflow',
  discountType: 'percent',
  discountValue: 20,
  appliesPlanCodes: null,
  validFrom: new Date('2026-11-01T00:00:00Z'),
  validUntil: new Date('2026-12-01T00:00:00Z'),
  maxRedemptions: 10,
  redemptionCount: 0,
  perWorkspaceLimit: 1,
  active: true,
};
const plan = { product: 'commentflow', code: 'pro', kind: 'base', priceVnd: 500_000 };
const ctx = (over: Partial<Parameters<typeof evaluateCoupon>[1]> = {}) => ({
  now: NOW,
  plan,
  workspaceRedemptions: 0,
  ...over,
});

describe('quyền quản trị gói/mã giảm giá (docs/13 §3.2)', () => {
  it('chỉ Super Admin sửa; Super + Finance xem', () => {
    expect(canManagePlansCoupons({ isAdmin: true, adminRole: 'super' })).toBe(true);
    for (const role of ['finance', 'support', null, 'root', '']) {
      expect(canManagePlansCoupons({ isAdmin: true, adminRole: role })).toBe(false);
    }
    expect(canManagePlansCoupons({ isAdmin: false, adminRole: 'super' })).toBe(false);
    expect(canViewCoupons({ isAdmin: true, adminRole: 'finance' })).toBe(true);
    expect(canViewCoupons({ isAdmin: true, adminRole: 'super' })).toBe(true);
    expect(canViewCoupons({ isAdmin: true, adminRole: 'support' })).toBe(false);
    expect(canViewCoupons({ isAdmin: false, adminRole: 'finance' })).toBe(false);
  });
});

describe('normalizeCouponCode', () => {
  it('cắt khoảng trắng, viết hoa; từ chối ký tự lạ/quá ngắn/quá dài', () => {
    expect(normalizeCouponCode('  tet-2027 ')).toBe('TET-2027');
    for (const bad of ['', 'ab', 'a b c', 'x'.repeat(33), 'mã-đặc-biệt', '-abc']) {
      expect(() => normalizeCouponCode(bad)).toThrow(/VALIDATION|không hợp lệ/i);
    }
  });
});

describe('parseCouponInput', () => {
  const valid = {
    code: 'tet-2027',
    product: 'commentflow',
    discountType: 'percent',
    discountValue: 15,
    appliesPlanCodes: ['pro'],
    validFrom: new Date('2026-11-01T00:00:00Z'),
    validUntil: new Date('2026-12-01T00:00:00Z'),
    maxRedemptions: 100,
    perWorkspaceLimit: 1,
    note: 'Khuyến mãi Tết',
  };
  it('chấp nhận hợp lệ và chuẩn hóa mã', () => {
    expect(parseCouponInput(valid).code).toBe('TET-2027');
  });
  it('từ chối: phần trăm 0/101, tiền cố định 0, hạn trước ngày bắt đầu, giới hạn 0, sản phẩm lạ', () => {
    const bad = [
      { ...valid, discountValue: 0 },
      { ...valid, discountValue: 101 },
      { ...valid, discountType: 'fixed_vnd', discountValue: 0 },
      { ...valid, validUntil: new Date('2026-10-01T00:00:00Z') },
      { ...valid, maxRedemptions: 0 },
      { ...valid, perWorkspaceLimit: 0 },
      { ...valid, product: 'tiktokflow' },
      { ...valid, appliesPlanCodes: ['Pro Plan'] },
      { ...valid, code: 'a b' },
    ];
    for (const input of bad) expect(() => parseCouponInput(input)).toThrow();
  });
  it('cho phép không hạn và không giới hạn tổng', () => {
    const parsed = parseCouponInput({ ...valid, validUntil: null, maxRedemptions: null });
    expect(parsed.validUntil).toBeNull();
    expect(parsed.maxRedemptions).toBeNull();
  });
});

describe('parsePlanUpdate', () => {
  const valid = {
    product: 'commentflow',
    code: 'pro',
    name: 'Pro',
    priceVnd: 500_000,
    channelsLimit: 3,
    monthlyTurns: 5000,
    autoReplyAllowed: true,
    active: true,
  };
  it('chấp nhận hợp lệ', () => {
    expect(parsePlanUpdate(valid).priceVnd).toBe(500_000);
  });
  it('từ chối giá âm, quá trần, lượt âm, tên rỗng, số lẻ', () => {
    for (const bad of [
      { ...valid, priceVnd: -1 },
      { ...valid, priceVnd: 1_000_000_001 },
      { ...valid, monthlyTurns: -5 },
      { ...valid, monthlyTurns: 1_000_001 },
      { ...valid, name: '' },
      { ...valid, priceVnd: 1.5 },
    ]) {
      expect(() => parsePlanUpdate(bad)).toThrow();
    }
  });
});

describe('evaluateCoupon', () => {
  it('phần trăm: làm tròn xuống, giá cuối = giá − giảm', () => {
    expect(evaluateCoupon(baseRule, ctx())).toEqual({
      ok: true,
      discountVnd: 100_000,
      finalPriceVnd: 400_000,
    });
    const r = evaluateCoupon(
      { ...baseRule, discountValue: 33 },
      ctx({ plan: { ...plan, priceVnd: 999 } }),
    );
    expect(r).toEqual({ ok: true, discountVnd: 329, finalPriceVnd: 670 });
  });
  it('tiền cố định: không vượt giá gói (không âm)', () => {
    const rule = { ...baseRule, discountType: 'fixed_vnd' as const, discountValue: 900_000 };
    expect(evaluateCoupon(rule, ctx())).toEqual({
      ok: true,
      discountVnd: 500_000,
      finalPriceVnd: 0,
    });
  });
  it('hạn dùng: biên bắt đầu (gồm) và kết thúc (loại)', () => {
    expect(evaluateCoupon(baseRule, ctx({ now: new Date('2026-10-31T23:59:59Z') }))).toEqual({
      ok: false,
      reason: 'not_started',
    });
    expect(evaluateCoupon(baseRule, ctx({ now: baseRule.validFrom })).ok).toBe(true);
    expect(evaluateCoupon(baseRule, ctx({ now: baseRule.validUntil as Date }))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
  it('không hạn kết thúc → luôn còn hạn', () => {
    expect(
      evaluateCoupon({ ...baseRule, validUntil: null }, ctx({ now: new Date('2099-01-01') })).ok,
    ).toBe(true);
  });
  it('tắt, hết lượt tổng, hết lượt mỗi workspace', () => {
    expect(evaluateCoupon({ ...baseRule, active: false }, ctx())).toEqual({
      ok: false,
      reason: 'inactive',
    });
    expect(evaluateCoupon({ ...baseRule, redemptionCount: 10 }, ctx())).toEqual({
      ok: false,
      reason: 'exhausted',
    });
    expect(evaluateCoupon({ ...baseRule, redemptionCount: 9 }, ctx()).ok).toBe(true);
    expect(evaluateCoupon(baseRule, ctx({ workspaceRedemptions: 1 }))).toEqual({
      ok: false,
      reason: 'workspace_limit_reached',
    });
    expect(
      evaluateCoupon({ ...baseRule, maxRedemptions: null, redemptionCount: 999_999 }, ctx()).ok,
    ).toBe(true);
  });
  it('gói không đủ điều kiện: khác sản phẩm, không nằm trong danh sách, không phải gói trả phí', () => {
    expect(evaluateCoupon({ ...baseRule, product: 'excelflow' }, ctx())).toEqual({
      ok: false,
      reason: 'product_mismatch',
    });
    expect(evaluateCoupon({ ...baseRule, appliesPlanCodes: ['starter'] }, ctx())).toEqual({
      ok: false,
      reason: 'plan_not_eligible',
    });
    expect(evaluateCoupon({ ...baseRule, appliesPlanCodes: ['pro'] }, ctx()).ok).toBe(true);
    for (const kind of ['trial', 'addon']) {
      expect(evaluateCoupon(baseRule, ctx({ plan: { ...plan, kind } }))).toEqual({
        ok: false,
        reason: 'plan_not_eligible',
      });
    }
  });
  it('gói 0 đồng: không áp (không tiêu lượt)', () => {
    expect(evaluateCoupon(baseRule, ctx({ plan: { ...plan, priceVnd: 0 } }))).toEqual({
      ok: false,
      reason: 'plan_not_eligible',
    });
  });
  it('parseCouponUpdate: hợp lệ và từ chối id/trần sai', () => {
    const ok = {
      id: '3f1c1f0e-8f5e-4a52-9d57-0a1f0c2b9e11',
      active: true,
      validUntil: null,
      maxRedemptions: 5,
      note: '',
    };
    expect(parseCouponUpdate(ok).maxRedemptions).toBe(5);
    expect(() => parseCouponUpdate({ ...ok, id: 'x' })).toThrow();
    expect(() => parseCouponUpdate({ ...ok, maxRedemptions: 0 })).toThrow();
  });
  it('dữ liệu hỏng → từ chối (fail-closed)', () => {
    expect(evaluateCoupon(baseRule, ctx({ plan: { ...plan, priceVnd: Number.NaN } })).ok).toBe(
      false,
    );
    expect(evaluateCoupon(baseRule, ctx({ workspaceRedemptions: -1 })).ok).toBe(false);
    expect(evaluateCoupon({ ...baseRule, discountValue: 0 }, ctx()).ok).toBe(false);
  });
});
