import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import { aiUsage } from '@flow/db/schema/cf';
import { workspaces } from '@flow/db/schema/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbCostLedger } from '../src/cost-gate/ledger';

let db: FlowDb;

beforeAll(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Thiếu TEST_DATABASE_URL');
  db = createDb({ connectionString: url, max: 3 });
});
afterAll(async () => {
  await db.close();
});

async function newWorkspace(cap: string | null): Promise<string> {
  const id = randomUUID();
  await db.withWorkspace(id, (tx) =>
    tx.insert(workspaces).values({
      id,
      name: 'Shop chi phí',
      slug: `shop-cg-${id}`,
      ...(cap !== null ? { aiCostCapUsd: cap } : {}),
    }),
  );
  return id;
}

const spend = (workspaceId: string, costUsd: string, createdAt: Date) =>
  db.withWorkspace(workspaceId, (tx) =>
    tx
      .insert(aiUsage)
      .values({ workspaceId, step: 'draft', model: 'mock-llm', costUsd, createdAt }),
  );

describe('FR-071 createDbCostLedger đọc DB thật', () => {
  const now = new Date('2026-11-06T12:00:00Z');

  it('cộng chi phí từ đầu tháng UTC, bỏ tháng trước, đọc trần của workspace', async () => {
    const ws = await newWorkspace('5.00');
    await spend(ws, '1.250000', new Date('2026-11-01T00:00:00Z')); // đúng biên đầu tháng → tính
    await spend(ws, '0.500000', new Date('2026-11-05T00:00:00Z'));
    await spend(ws, '9.000000', new Date('2026-10-31T23:59:59Z')); // tháng trước → không tính
    const snapshot = await createDbCostLedger(db).read(ws, now);
    expect(snapshot.spentMonthUsd).toBeCloseTo(1.75, 6);
    expect(snapshot.capUsd).toBe(5);
  });

  it('chưa có chi tiêu/chưa đặt trần → 0 và null; workspace khác không lẫn vào', async () => {
    const wsA = await newWorkspace(null);
    const wsB = await newWorkspace('1.00');
    await spend(wsB, '0.750000', new Date('2026-11-02T00:00:00Z'));
    expect(await createDbCostLedger(db).read(wsA, now)).toEqual({ spentMonthUsd: 0, capUsd: null });
    expect((await createDbCostLedger(db).read(wsB, now)).spentMonthUsd).toBeCloseTo(0.75, 6);
  });

  it('workspace không tồn tại → NOT_FOUND (đóng, không coi là "không trần")', async () => {
    await expect(createDbCostLedger(db).read(randomUUID(), now)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
