import { describe, expect, it } from 'vitest';
import {
  type PlanCatalogEntry,
  parseActivatePlan,
  parseGrantAddon,
  resolvePlanState,
  type SubscriptionInfo,
} from './plan';

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-15T00:00:00Z');

const trial: PlanCatalogEntry = {
  code: 'trial',
  kind: 'trial',
  channelsLimit: 1,
  monthlyTurns: 300,
  autoReplyAllowed: false,
};
const growth: PlanCatalogEntry = {
  code: 'growth',
  kind: 'base',
  channelsLimit: 3,
  monthlyTurns: 3000,
  autoReplyAllowed: true,
};
const sub = (over: Partial<SubscriptionInfo> = {}): SubscriptionInfo => ({
  planCode: 'growth',
  status: 'active',
  periodEnd: new Date(NOW.getTime() + 10 * DAY),
  cancelAt: null,
  ...over,
});

describe('FR-090 resolvePlanState — gói hiệu lực của workspace', () => {
  it('FR-090 không có gói → state none, mọi hạn mức 0, không tự gửi (fail-closed)', () => {
    expect(resolvePlanState(null, null, NOW)).toMatchObject({
      state: 'none',
      turnsLimit: 0,
      channelsLimit: 0,
      autoReplyAllowed: false,
      trialDaysLeft: null,
    });
  });

  it('FR-090 dùng thử còn hạn → hạn mức của gói trial và số ngày còn lại (làm tròn lên)', () => {
    const s = sub({
      planCode: 'trial',
      status: 'trialing',
      periodEnd: new Date(NOW.getTime() + 3 * DAY - 1),
    });
    expect(resolvePlanState(s, trial, NOW)).toMatchObject({
      state: 'trialing',
      turnsLimit: 300,
      channelsLimit: 1,
      autoReplyAllowed: false,
      trialDaysLeft: 3,
    });
  });

  it('FR-090 dùng thử đúng thời điểm hết hạn → trial_expired, hạn mức 0', () => {
    const s = sub({ planCode: 'trial', status: 'trialing', periodEnd: NOW });
    expect(resolvePlanState(s, trial, NOW)).toMatchObject({
      state: 'trial_expired',
      turnsLimit: 0,
      autoReplyAllowed: false,
      trialDaysLeft: 0,
    });
  });

  it('US-060 gói trả phí còn hạn → hạn mức theo gói, trialDaysLeft null', () => {
    expect(resolvePlanState(sub(), growth, NOW)).toMatchObject({
      state: 'active',
      turnsLimit: 3000,
      channelsLimit: 3,
      autoReplyAllowed: true,
      trialDaysLeft: null,
      cancelAtPeriodEnd: false,
    });
  });

  it('FR-090 gói trả phí quá hạn (đúng thời điểm periodEnd) → expired, hạn mức 0', () => {
    expect(resolvePlanState(sub({ periodEnd: NOW }), growth, NOW)).toMatchObject({
      state: 'expired',
      turnsLimit: 0,
      autoReplyAllowed: false,
    });
  });

  it('FR-090 past_due còn trong kỳ → giữ hạn mức nhưng không tự gửi; quá kỳ → expired', () => {
    expect(resolvePlanState(sub({ status: 'past_due' }), growth, NOW)).toMatchObject({
      state: 'past_due',
      turnsLimit: 3000,
      autoReplyAllowed: false,
    });
    const late = sub({ status: 'past_due', periodEnd: NOW });
    expect(resolvePlanState(late, growth, NOW)).toMatchObject({ state: 'expired', turnsLimit: 0 });
  });

  it('FR-090 status canceled → canceled, hạn mức 0 dù còn trong kỳ', () => {
    expect(resolvePlanState(sub({ status: 'canceled' }), growth, NOW)).toMatchObject({
      state: 'canceled',
      turnsLimit: 0,
      autoReplyAllowed: false,
    });
  });

  it('FR-090 hủy cuối kỳ: cancelAt tương lai → vẫn active + cờ; cancelAt đã qua → canceled', () => {
    const future = new Date(NOW.getTime() + 5 * DAY);
    expect(resolvePlanState(sub({ cancelAt: future }), growth, NOW)).toMatchObject({
      state: 'active',
      cancelAtPeriodEnd: true,
      turnsLimit: 3000,
    });
    expect(resolvePlanState(sub({ cancelAt: NOW }), growth, NOW)).toMatchObject({
      state: 'canceled',
      turnsLimit: 0,
    });
  });

  it('FR-090 gói trong catalog không khớp planCode của subscription → fail-closed (none)', () => {
    expect(resolvePlanState(sub({ planCode: 'business' }), growth, NOW).state).toBe('none');
    expect(resolvePlanState(sub(), null, NOW).state).toBe('none');
  });

  it('FR-090 status trialing nhưng gói không phải kind trial (dữ liệu hỏng) → fail-closed (none)', () => {
    expect(resolvePlanState(sub({ status: 'trialing' }), growth, NOW).state).toBe('none');
  });

  it('FR-090 past_due với gói không phải base, hoặc hạn là ngày hỏng → fail-closed (none)', () => {
    expect(resolvePlanState(sub({ status: 'past_due', planCode: 'trial' }), trial, NOW).state).toBe(
      'none',
    );
    expect(resolvePlanState(sub({ periodEnd: new Date('x') }), growth, NOW).state).toBe('none');
  });

  it('FR-090 active với gói không phải base (dữ liệu hỏng) → fail-closed (none)', () => {
    expect(resolvePlanState(sub({ planCode: 'trial' }), trial, NOW).state).toBe('none');
  });

  it('FR-090 thời điểm không hợp lệ → ném lỗi, không đoán', () => {
    expect(() => resolvePlanState(sub(), growth, new Date('x'))).toThrow();
  });
});

describe('FR-090 parseActivatePlan / parseGrantAddon — kiểm đầu vào trước khi gọi hàm DB', () => {
  const ws = '11111111-1111-4111-8111-111111111111';
  const start = new Date('2026-11-01T00:00:00Z');
  const end = new Date('2026-12-01T00:00:00Z');

  it('FR-090 kích hoạt gói hợp lệ đi qua; kỳ ngược/mã gói lạ/workspace sai bị từ chối', () => {
    const ok = {
      workspaceId: ws,
      product: 'commentflow',
      planCode: 'growth',
      periodStart: start,
      periodEnd: end,
    };
    expect(parseActivatePlan(ok).planCode).toBe('growth');
    expect(() => parseActivatePlan({ ...ok, periodEnd: start })).toThrow();
    expect(() => parseActivatePlan({ ...ok, planCode: 'Growth; DROP' })).toThrow();
    expect(() => parseActivatePlan({ ...ok, workspaceId: 'x' })).toThrow();
    expect(() => parseActivatePlan({ ...ok, product: 'tiktok' })).toThrow();
  });

  it('FR-090 mua thêm lượt: chỉ mã addon_*, số lượng nguyên 1–1000, kỳ phải là ngày 1', () => {
    const ok = {
      workspaceId: ws,
      product: 'commentflow',
      meter: 'ai_turns',
      periodStart: '2026-11-01',
      addonCode: 'addon_1000',
      quantity: 2,
    };
    expect(parseGrantAddon(ok).quantity).toBe(2);
    expect(() => parseGrantAddon({ ...ok, addonCode: 'growth' })).toThrow();
    expect(() => parseGrantAddon({ ...ok, quantity: 0 })).toThrow();
    expect(() => parseGrantAddon({ ...ok, quantity: 1001 })).toThrow();
    expect(() => parseGrantAddon({ ...ok, quantity: 1.5 })).toThrow();
    expect(() => parseGrantAddon({ ...ok, periodStart: '2026-11-15' })).toThrow();
  });
});
