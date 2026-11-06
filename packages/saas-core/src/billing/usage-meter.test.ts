import type { FlowDb } from '@flow/db/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const consumeUsage = vi.fn();
const getUsageCounter = vi.fn();
vi.mock('@flow/db/runtime', () => ({
  consumeUsage: (...args: unknown[]) => consumeUsage(...args),
  getUsageCounter: (...args: unknown[]) => getUsageCounter(...args),
}));

const { createUsageMeter } = await import('./usage-meter');

const WS = '11111111-1111-4111-8111-111111111111';
const TX = { tx: true };

function fakeDb() {
  const withJob = vi.fn(async (_ws: string, fn: (tx: unknown) => Promise<unknown>) => fn(TX));
  const withWorkspace = vi.fn(async (_ws: string, fn: (tx: unknown) => Promise<unknown>) => fn(TX));
  return { db: { withJob, withWorkspace } as unknown as FlowDb, withJob, withWorkspace };
}

const NOW = new Date('2026-11-15T05:00:00Z');
const VN = 'Asia/Ho_Chi_Minh';

beforeEach(() => {
  consumeUsage.mockReset();
  getUsageCounter.mockReset();
});

describe('FR-090 createUsageMeter.consume — trừ lượt AI của workspace', () => {
  it('FR-090 trừ trong withJob của đúng workspace, kỳ = tháng theo múi giờ, kèm trạng thái đồng hồ', async () => {
    consumeUsage.mockResolvedValue({
      allowed: true,
      used: 8,
      limit: 10,
      addon: 0,
      warnedNow: true,
      blockedNow: false,
    });
    const { db, withJob } = fakeDb();
    const meter = createUsageMeter({
      db,
      product: 'commentflow',
      meter: 'ai_turns',
      now: () => NOW,
    });

    const result = await meter.consume(WS, { limit: 10, timeZone: VN });

    expect(withJob).toHaveBeenCalledWith(WS, expect.any(Function));
    expect(consumeUsage).toHaveBeenCalledWith(TX, {
      workspaceId: WS,
      product: 'commentflow',
      meter: 'ai_turns',
      amount: 1,
      periodStart: '2026-11-01',
      limit: 10,
    });
    expect(result).toEqual({
      allowed: true,
      periodStart: '2026-11-01',
      warnedNow: true,
      blockedNow: false,
      status: { capacity: 10, remaining: 2, percent: 80, level: 'warning' },
    });
  });

  it('FR-090 hết hạn mức → allowed=false, trạng thái blocked (AI phải dừng)', async () => {
    consumeUsage.mockResolvedValue({
      allowed: false,
      used: 10,
      limit: 10,
      addon: 0,
      warnedNow: false,
      blockedNow: true,
    });
    const { db } = fakeDb();
    const meter = createUsageMeter({
      db,
      product: 'commentflow',
      meter: 'ai_turns',
      now: () => NOW,
    });

    const result = await meter.consume(WS, { limit: 10, timeZone: VN, amount: 2 });

    expect(consumeUsage).toHaveBeenCalledWith(TX, expect.objectContaining({ amount: 2 }));
    expect(result).toMatchObject({
      allowed: false,
      blockedNow: true,
      status: { level: 'blocked', remaining: 0, percent: 100 },
    });
  });

  it('FR-090 đầu vào sai bị từ chối TRƯỚC khi chạm DB (không mở giao dịch)', async () => {
    const { db, withJob } = fakeDb();
    const meter = createUsageMeter({
      db,
      product: 'commentflow',
      meter: 'ai_turns',
      now: () => NOW,
    });
    await expect(meter.consume(WS, { limit: -1, timeZone: VN })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(meter.consume(WS, { limit: 5, timeZone: VN, amount: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(meter.consume(WS, { limit: 5, timeZone: 'Mars/X' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(withJob).not.toHaveBeenCalled();
    expect(consumeUsage).not.toHaveBeenCalled();
  });

  it('FR-090 sản phẩm/đồng hồ lạ bị từ chối khi tạo bộ đếm', () => {
    const { db } = fakeDb();
    expect(() => createUsageMeter({ db, product: 'tiktok', meter: 'ai_turns' })).toThrow();
    expect(() => createUsageMeter({ db, product: 'commentflow', meter: 'AI' })).toThrow();
  });

  it('FR-090 mặc định dùng đồng hồ thật của hệ thống (new Date) khi không tiêm now', async () => {
    consumeUsage.mockResolvedValue({
      allowed: true,
      used: 1,
      limit: 10,
      addon: 0,
      warnedNow: false,
      blockedNow: false,
    });
    const { db } = fakeDb();
    const meter = createUsageMeter({ db, product: 'commentflow', meter: 'ai_turns' });
    const result = await meter.consume(WS, { limit: 10, timeZone: 'UTC' });
    expect(result.periodStart).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('FR-090 createUsageMeter.read — đồng hồ lượt cho giao diện', () => {
  it('FR-090 chưa có dòng của kỳ → used 0 theo hạn mức được truyền, không ghi gì', async () => {
    getUsageCounter.mockResolvedValue(null);
    const { db, withWorkspace, withJob } = fakeDb();
    const meter = createUsageMeter({
      db,
      product: 'commentflow',
      meter: 'ai_turns',
      now: () => NOW,
    });

    const status = await meter.read(WS, { limit: 300, timeZone: VN });

    expect(withWorkspace).toHaveBeenCalledWith(WS, expect.any(Function));
    expect(withJob).not.toHaveBeenCalled();
    expect(getUsageCounter).toHaveBeenCalledWith(TX, {
      workspaceId: WS,
      product: 'commentflow',
      meter: 'ai_turns',
      periodStart: '2026-11-01',
    });
    expect(status).toEqual({ capacity: 300, remaining: 300, percent: 0, level: 'ok' });
  });

  it('FR-090 có dòng → dùng used/limit/addon của dòng (gồm lượt mua thêm)', async () => {
    getUsageCounter.mockResolvedValue({
      used: 1000,
      limit: 1000,
      addon: 1000,
      warned80At: new Date(),
      blockedAt: new Date(),
    });
    const { db } = fakeDb();
    const meter = createUsageMeter({
      db,
      product: 'commentflow',
      meter: 'ai_turns',
      now: () => NOW,
    });
    expect(await meter.read(WS, { limit: 1000, timeZone: VN })).toEqual({
      capacity: 2000,
      remaining: 1000,
      percent: 50,
      level: 'ok',
    });
  });

  it('FR-090 hạn mức/múi giờ sai → VALIDATION_FAILED', async () => {
    const { db, withWorkspace } = fakeDb();
    const meter = createUsageMeter({
      db,
      product: 'commentflow',
      meter: 'ai_turns',
      now: () => NOW,
    });
    await expect(meter.read(WS, { limit: -5, timeZone: VN })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(withWorkspace).not.toHaveBeenCalled();
  });
});
