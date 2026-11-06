import type { FlowDb } from '@flow/db';
import { describe, expect, it } from 'vitest';
import { createDbCostLedger, createMemoryCostLedger, monthStartUtc } from './ledger';

/** DB giả: `select().from().where()` trả lần lượt dòng ai_usage rồi dòng workspaces. */
function fakeDb(usageRows: unknown[], workspaceRows: unknown[]): FlowDb {
  const results = [usageRows, workspaceRows];
  const tx = {
    select: () => ({ from: () => ({ where: async () => results.shift() }) }),
  };
  return { withWorkspace: async (_id: string, fn: (t: unknown) => unknown) => fn(tx) } as FlowDb;
}

describe('FR-071 createDbCostLedger (DB giả; bản DB thật ở tests/cost-ledger.int.test.ts)', () => {
  const now = new Date('2026-11-06T00:00:00Z');

  it('đọc tổng chi (chuỗi numeric) và trần', async () => {
    const db = fakeDb([{ total: '1.750000' }], [{ cap: '5.00' }]);
    expect(await createDbCostLedger(db).read('w', now)).toEqual({ spentMonthUsd: 1.75, capUsd: 5 });
  });

  it('chưa đặt trần → null; không có dòng tổng → 0', async () => {
    const db = fakeDb([], [{ cap: null }]);
    expect(await createDbCostLedger(db).read('w', now)).toEqual({ spentMonthUsd: 0, capUsd: null });
  });

  it('workspace không tồn tại → NOT_FOUND', async () => {
    const db = fakeDb([{ total: '0' }], []);
    await expect(createDbCostLedger(db).read('w', now)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('trần hỏng (âm/chữ) → NaN để cổng chặn invalid_input, không thành "không trần"', async () => {
    const db = fakeDb([{ total: '0' }], [{ cap: 'abc' }]);
    const snapshot = await createDbCostLedger(db).read('w', now);
    expect(snapshot.capUsd).toBeNaN();
  });

  it('tổng chi hỏng → NaN (cổng chặn), không âm thầm coi là 0', async () => {
    const db = fakeDb([{ total: '-3' }], [{ cap: '5' }]);
    const snapshot = await createDbCostLedger(db).read('w', now);
    expect(snapshot.spentMonthUsd).toBeNaN();
  });
});

describe('FR-071 sổ chi phí', () => {
  it('monthStartUtc: 00:00 UTC ngày 1 của tháng (cả biên cuối/đầu tháng)', () => {
    expect(monthStartUtc(new Date('2026-11-06T10:00:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(monthStartUtc(new Date('2026-11-30T23:59:59.999Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(monthStartUtc(new Date('2026-12-01T00:00:00.000Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('kho bộ nhớ: mặc định chưa trần, chưa chi; chỉ tính chi từ đầu tháng của `now`', async () => {
    const ledger = createMemoryCostLedger();
    const now = new Date('2026-11-06T00:00:00Z');
    expect(await ledger.read('a', now)).toEqual({ spentMonthUsd: 0, capUsd: null });
    ledger.setCap('a', 5);
    ledger.addSpend('a', 1.5, new Date('2026-11-02T00:00:00Z'));
    ledger.addSpend('a', 2, new Date('2026-10-31T23:59:59Z')); // tháng trước — không tính
    ledger.addSpend('b', 9, new Date('2026-11-02T00:00:00Z')); // workspace khác
    expect(await ledger.read('a', now)).toEqual({ spentMonthUsd: 1.5, capUsd: 5 });
  });
});
