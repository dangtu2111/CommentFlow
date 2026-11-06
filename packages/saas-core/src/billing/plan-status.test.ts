import type { FlowDb } from '@flow/db/runtime';
import type { PlanState } from '@flow/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlanState = vi.fn();
const getUsageCounter = vi.fn();
vi.mock('@flow/db/runtime', () => ({
  getPlanState: (...args: unknown[]) => getPlanState(...args),
  getUsageCounter: (...args: unknown[]) => getUsageCounter(...args),
}));

const { createPlanStatusReader } = await import('./plan-status');

const WS = '11111111-1111-4111-8111-111111111111';
const TX = { tx: true };
const NOW = new Date('2026-11-15T05:00:00Z');
const VN = 'Asia/Ho_Chi_Minh';

function fakeDb() {
  const withWorkspace = vi.fn(async (_ws: string, fn: (tx: unknown) => Promise<unknown>) => fn(TX));
  return { db: { withWorkspace } as unknown as Pick<FlowDb, 'withWorkspace'>, withWorkspace };
}

const planState = (over: Partial<PlanState> = {}): PlanState => ({
  state: 'active',
  planCode: 'growth',
  turnsLimit: 3000,
  channelsLimit: 3,
  autoReplyAllowed: true,
  trialDaysLeft: null,
  periodEnd: new Date('2026-12-01T00:00:00Z'),
  cancelAtPeriodEnd: false,
  ...over,
});

beforeEach(() => {
  getPlanState.mockReset();
  getUsageCounter.mockReset();
});

describe('FR-090 createPlanStatusReader.read — gói hiệu lực + đồng hồ lượt', () => {
  it('FR-090 hạn mức lấy từ gói (không từ số đã lưu trong bộ đếm), cộng lượt mua thêm', async () => {
    getPlanState.mockResolvedValue(planState());
    getUsageCounter.mockResolvedValue({
      used: 2900,
      limit: 1000, // số cũ của gói trước: không được dùng
      addon: 200,
      warned80At: null,
      blockedAt: null,
    });
    const { db, withWorkspace } = fakeDb();
    const reader = createPlanStatusReader({
      db,
      product: 'commentflow',
      meter: 'ai_turns',
      now: () => NOW,
    });

    const result = await reader.read(WS, VN);

    expect(withWorkspace).toHaveBeenCalledWith(WS, expect.any(Function));
    expect(getPlanState).toHaveBeenCalledWith(TX, WS, 'commentflow', NOW);
    expect(getUsageCounter).toHaveBeenCalledWith(TX, {
      workspaceId: WS,
      product: 'commentflow',
      meter: 'ai_turns',
      periodStart: '2026-11-01',
    });
    expect(result.plan.planCode).toBe('growth');
    expect(result.usage).toMatchObject({ capacity: 3200, remaining: 300, level: 'warning' });
    expect(result.aiAllowed).toBe(true);
  });

  it('FR-090 chưa có dòng bộ đếm → 0 lượt đã dùng, còn nguyên hạn mức gói', async () => {
    getPlanState.mockResolvedValue(planState({ state: 'trialing', turnsLimit: 300 }));
    getUsageCounter.mockResolvedValue(null);
    const { db } = fakeDb();
    const reader = createPlanStatusReader({ db, product: 'commentflow', meter: 'ai_turns' });

    const result = await reader.read(WS, VN);

    expect(result.usage).toMatchObject({ capacity: 300, remaining: 300, level: 'ok' });
    expect(result.aiAllowed).toBe(true);
  });

  it('FR-090 hết dùng thử / không có gói → AI không được chạy dù bộ đếm còn lượt mua thêm', async () => {
    getUsageCounter.mockResolvedValue({
      used: 0,
      limit: 0,
      addon: 1000,
      warned80At: null,
      blockedAt: null,
    });
    const { db } = fakeDb();
    const reader = createPlanStatusReader({ db, product: 'commentflow', meter: 'ai_turns' });
    for (const state of ['trial_expired', 'expired', 'canceled', 'none'] as const) {
      getPlanState.mockResolvedValue(planState({ state, turnsLimit: 0, autoReplyAllowed: false }));
      expect((await reader.read(WS, VN)).aiAllowed, state).toBe(false);
    }
  });

  it('FR-090 gói còn hạn nhưng hết lượt (kể cả mua thêm) → aiAllowed false, level blocked', async () => {
    getPlanState.mockResolvedValue(planState({ turnsLimit: 100 }));
    getUsageCounter.mockResolvedValue({
      used: 150,
      limit: 100,
      addon: 50,
      warned80At: null,
      blockedAt: null,
    });
    const { db } = fakeDb();
    const reader = createPlanStatusReader({ db, product: 'commentflow', meter: 'ai_turns' });

    const result = await reader.read(WS, VN);

    expect(result.usage.level).toBe('blocked');
    expect(result.aiAllowed).toBe(false);
  });

  it('FR-090 past_due còn kỳ vẫn cho AI soạn (giữ hạn mức); sản phẩm/đồng hồ sai bị từ chối khi dựng', () => {
    const { db } = fakeDb();
    expect(() => createPlanStatusReader({ db, product: 'tiktok', meter: 'ai_turns' })).toThrow();
    expect(() =>
      createPlanStatusReader({ db, product: 'commentflow', meter: 'Bad Meter' }),
    ).toThrow();
  });

  it('FR-090 past_due → aiAllowed true khi còn lượt', async () => {
    getPlanState.mockResolvedValue(planState({ state: 'past_due', autoReplyAllowed: false }));
    getUsageCounter.mockResolvedValue(null);
    const { db } = fakeDb();
    const reader = createPlanStatusReader({ db, product: 'commentflow', meter: 'ai_turns' });
    expect((await reader.read(WS, VN)).aiAllowed).toBe(true);
  });
});
