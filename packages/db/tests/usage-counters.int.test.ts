import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { type ConsumeUsageInput, consumeUsage, getUsageCounter } from '../src/usage-counters';
import {
  createAdminPool,
  createWebDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * USAGE-COUNTERS (migration 0039, FR-090, Q-UC1): bảng `core.usage_counters` chỉ ĐỌC với cf_app; ghi duy nhất qua hàm
 * DEFINER `core.consume_usage` (đường `withJob` của đúng workspace trên kết nối `cf_worker`). Mỗi test dùng kỳ riêng.
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let memberA: string;
let memberB: string;
let outsider: string;

let periodSeq = 0;
/** Kỳ duy nhất cho mỗi test (ngày 1 của tháng tăng dần từ năm 2100) — không đụng dữ liệu của test khác. */
const nextPeriod = (): string => {
  periodSeq += 1;
  const month = ((periodSeq - 1) % 12) + 1;
  const year = 2100 + Math.floor((periodSeq - 1) / 12);
  return `${year}-${String(month).padStart(2, '0')}-01`;
};

const base = (periodStart: string, over: Partial<ConsumeUsageInput> = {}): ConsumeUsageInput => ({
  workspaceId: wsA,
  product: 'commentflow',
  meter: 'ai_turns',
  amount: 1,
  periodStart,
  limit: 10,
  ...over,
});
const consume = (input: ConsumeUsageInput) =>
  worker.withJob(input.workspaceId, (tx) => consumeUsage(tx, input));
const readRow = async (ws: string, period: string) => {
  const result = await admin.query(
    `SELECT used, limit_amount, addon, warned_80_at, blocked_at FROM core.usage_counters
      WHERE workspace_id = $1 AND product = 'commentflow' AND meter = 'ai_turns' AND period_start = $2`,
    [ws, period],
  );
  return result.rows[0] as
    | {
        used: number;
        limit_amount: number;
        addon: number;
        warned_80_at: Date | null;
        blocked_at: Date | null;
      }
    | undefined;
};

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  memberA = await seedUser(admin);
  memberB = await seedUser(admin);
  outsider = await seedUser(admin);
  await seedMember(admin, wsA, memberA, 'staff');
  await seedMember(admin, wsB, memberB, 'owner');
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close(), admin.end()]);
});

describe('FR-090 trừ lượt AI — hạn mức và chặn ở 100%', () => {
  it('FR-090 lần đầu tạo dòng của kỳ rồi trừ; trả used/limit', async () => {
    const period = nextPeriod();
    const result = await consume(base(period, { amount: 3 }));
    expect(result).toMatchObject({
      allowed: true,
      used: 3,
      limit: 10,
      addon: 0,
      warnedNow: false,
      blockedNow: false,
    });
    expect(await readRow(wsA, period)).toMatchObject({ used: 3, limit_amount: 10 });
  });

  it('FR-090 đúng ngưỡng: còn đủ thì trừ hết (10/10), lần sau bị chặn, KHÔNG trừ, blocked_at ghi MỘT lần', async () => {
    const period = nextPeriod();
    expect((await consume(base(period, { amount: 10 }))).allowed).toBe(true);
    const first = await consume(base(period));
    expect(first).toMatchObject({ allowed: false, used: 10, blockedNow: true });
    const blockedAt = (await readRow(wsA, period))?.blocked_at;
    expect(blockedAt).toBeInstanceOf(Date);
    const second = await consume(base(period));
    expect(second).toMatchObject({ allowed: false, used: 10, blockedNow: false });
    expect((await readRow(wsA, period))?.blocked_at?.getTime()).toBe(blockedAt?.getTime());
    expect((await readRow(wsA, period))?.used).toBe(10);
  });

  it('FR-090 vượt ±1: còn 1 mà xin 2 → chặn, không trừ nửa chừng', async () => {
    const period = nextPeriod();
    await consume(base(period, { amount: 9 }));
    expect(await consume(base(period, { amount: 2 }))).toMatchObject({ allowed: false, used: 9 });
    expect(await consume(base(period, { amount: 1 }))).toMatchObject({ allowed: true, used: 10 });
  });

  it('FR-090 hạn mức 0 (gói không có AI) chặn ngay lần đầu', async () => {
    const period = nextPeriod();
    expect(await consume(base(period, { limit: 0 }))).toMatchObject({
      allowed: false,
      used: 0,
      blockedNow: true,
    });
  });

  it('FR-090 chạm 80% lần đầu → warnedNow=true và warned_80_at ghi đúng một lần', async () => {
    const period = nextPeriod();
    expect(await consume(base(period, { amount: 7 }))).toMatchObject({ warnedNow: false });
    expect(await readRow(wsA, period)).toMatchObject({ warned_80_at: null });
    expect(await consume(base(period))).toMatchObject({ allowed: true, used: 8, warnedNow: true });
    const warnedAt = (await readRow(wsA, period))?.warned_80_at;
    expect(warnedAt).toBeInstanceOf(Date);
    expect(await consume(base(period))).toMatchObject({ used: 9, warnedNow: false });
    expect((await readRow(wsA, period))?.warned_80_at?.getTime()).toBe(warnedAt?.getTime());
  });

  it('FR-090 vượt thẳng 80% rồi 100% trong một lần trừ vẫn báo cảnh báo một lần', async () => {
    const period = nextPeriod();
    expect(await consume(base(period, { amount: 10 }))).toMatchObject({
      allowed: true,
      warnedNow: true,
    });
  });

  it('FR-090 lượt mua thêm (addon) nâng trần: có addon thì trừ tiếp được', async () => {
    const period = nextPeriod();
    await consume(base(period, { amount: 10 }));
    expect((await consume(base(period))).allowed).toBe(false);
    await admin.query(
      `UPDATE core.usage_counters SET addon = 5 WHERE workspace_id = $1 AND period_start = $2`,
      [wsA, period],
    );
    expect(await consume(base(period))).toMatchObject({ allowed: true, used: 11, addon: 5 });
  });

  it('FR-090 hạn mức do nơi gọi quyết định mỗi lần (nâng gói → trần mới có hiệu lực ngay)', async () => {
    const period = nextPeriod();
    await consume(base(period, { amount: 10 }));
    expect((await consume(base(period))).allowed).toBe(false);
    expect(await consume(base(period, { limit: 20 }))).toMatchObject({
      allowed: true,
      used: 11,
      limit: 20,
    });
  });

  it('FR-090 mỗi kỳ, mỗi workspace, mỗi đồng hồ đếm riêng', async () => {
    const p1 = nextPeriod();
    const p2 = nextPeriod();
    await consume(base(p1, { amount: 4 }));
    expect(await consume(base(p2))).toMatchObject({ used: 1 });
    expect(await consume(base(p1, { workspaceId: wsB }))).toMatchObject({ used: 1 });
    expect(await consume(base(p1, { meter: 'other_meter' }))).toMatchObject({ used: 1 });
    expect(await consume(base(p1, { product: 'excelflow' }))).toMatchObject({ used: 1 });
    expect(await consume(base(p1))).toMatchObject({ used: 5 });
  });

  it('FR-090 đua: 20 lệnh song song với hạn mức 10 → đúng 10 được phép, used = 10', async () => {
    const period = nextPeriod();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume(base(period, { limit: 10 }))),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.filter((r) => !r.allowed)).toHaveLength(10);
    expect(results.filter((r) => r.warnedNow)).toHaveLength(1);
    expect(results.filter((r) => r.blockedNow)).toHaveLength(1);
    expect((await readRow(wsA, period))?.used).toBe(10);
  });
});

describe('FR-090 đầu vào sai bị từ chối ở DB (lớp thứ hai sau Zod)', () => {
  it('FR-090 amount ≤ 0, quá lớn, limit âm, sản phẩm/meter lạ, → 22023', async () => {
    const period = nextPeriod();
    for (const bad of [
      { amount: 0 },
      { amount: -1 },
      { amount: 1001 },
      { limit: -1 },
      { limit: 1_000_000_001 },
      { product: 'tiktok' },
      { meter: 'AI Turns' },
      { meter: '' },
    ]) {
      expect(await expectRejectCode(consume(base(period, bad as Partial<ConsumeUsageInput>)))).toBe(
        '22023',
      );
    }
    expect(await readRow(wsA, period)).toBeUndefined();
  });
});

describe('FR-090 chỉ hệ thống của đúng workspace được ghi', () => {
  it('FR-090 cf_app (web) không gọi được hàm — kể cả đường withJob/withWorkspace/withActor', async () => {
    const period = nextPeriod();
    const input = base(period);
    for (const run of [
      () => web.withJob(wsA, (tx) => consumeUsage(tx, input)),
      () => web.withWorkspace(wsA, (tx) => consumeUsage(tx, input)),
      () => web.withActor(wsA, memberA, (tx) => consumeUsage(tx, input)),
    ]) {
      expect(await expectRejectCode(run())).toBe('42501');
    }
    expect(await readRow(wsA, period)).toBeUndefined();
  });

  it('FR-090 kết nối worker nhưng sai ngữ cảnh (trần, workspace thường, người dùng) bị từ chối', async () => {
    const period = nextPeriod();
    const input = base(period);
    expect(await expectRejectCode(worker.withSystem((tx) => consumeUsage(tx, input)))).toBe(
      '42501',
    );
    expect(await expectRejectCode(worker.withWorkspace(wsA, (tx) => consumeUsage(tx, input)))).toBe(
      '42501',
    );
    expect(
      await expectRejectCode(worker.withActor(wsA, memberA, (tx) => consumeUsage(tx, input))),
    ).toBe('42501');
    expect(await readRow(wsA, period)).toBeUndefined();
  });

  it('FR-090 job của workspace B không trừ được lượt của workspace A', async () => {
    const period = nextPeriod();
    const code = await expectRejectCode(
      worker.withJob(wsB, (tx) => consumeUsage(tx, base(period, { workspaceId: wsA }))),
    );
    expect(code).toBe('42501');
    expect(await readRow(wsA, period)).toBeUndefined();
  });

  it('FR-090 cf_app không INSERT/UPDATE/DELETE trực tiếp bảng bộ đếm', async () => {
    const period = nextPeriod();
    await consume(base(period));
    const attempts = [
      (tx: Parameters<Parameters<FlowDb['withJob']>[1]>[0]) =>
        tx.execute(sql`INSERT INTO core.usage_counters (workspace_id, product, meter, period_start)
          VALUES (${wsA}, 'commentflow', 'ai_turns', ${nextPeriod()})`),
      (tx: Parameters<Parameters<FlowDb['withJob']>[1]>[0]) =>
        tx.execute(sql`UPDATE core.usage_counters SET used = 0 WHERE workspace_id = ${wsA}`),
      (tx: Parameters<Parameters<FlowDb['withJob']>[1]>[0]) =>
        tx.execute(sql`DELETE FROM core.usage_counters WHERE workspace_id = ${wsA}`),
    ];
    for (const attempt of attempts) {
      expect(await expectRejectCode(web.withActor(wsA, memberA, attempt))).toBe('42501');
      expect(await expectRejectCode(web.withJob(wsA, attempt))).toBe('42501');
      expect(await expectRejectCode(worker.withJob(wsA, attempt))).toBe('42501');
    }
    expect((await readRow(wsA, period))?.used).toBe(1);
  });
});

describe('FR-090 đọc đồng hồ lượt (RLS)', () => {
  it('FR-090 thành viên đọc được bộ đếm của workspace mình', async () => {
    const period = nextPeriod();
    await consume(base(period, { amount: 4 }));
    const row = await web.withActor(wsA, memberA, (tx) =>
      getUsageCounter(tx, {
        workspaceId: wsA,
        product: 'commentflow',
        meter: 'ai_turns',
        periodStart: period,
      }),
    );
    expect(row).toMatchObject({ used: 4, limit: 10, addon: 0, warned80At: null, blockedAt: null });
  });

  it('FR-090 chưa có dòng của kỳ → null (không tự tạo khi đọc)', async () => {
    const period = nextPeriod();
    const row = await web.withActor(wsA, memberA, (tx) =>
      getUsageCounter(tx, {
        workspaceId: wsA,
        product: 'commentflow',
        meter: 'ai_turns',
        periodStart: period,
      }),
    );
    expect(row).toBeNull();
    expect(await readRow(wsA, period)).toBeUndefined();
  });

  it('FR-090 chéo workspace: B không thấy của A; người ngoài không thấy gì; id sai workspace → null', async () => {
    const period = nextPeriod();
    await consume(base(period));
    const key = {
      workspaceId: wsA,
      product: 'commentflow',
      meter: 'ai_turns',
      periodStart: period,
    } as const;
    expect(await web.withActor(wsB, memberB, (tx) => getUsageCounter(tx, key))).toBeNull();
    expect(await web.withWorkspace(wsB, (tx) => getUsageCounter(tx, key))).toBeNull();
    expect(await web.withActor(wsA, outsider, (tx) => getUsageCounter(tx, key))).toBeNull();
    // người dùng không phải thành viên A, nhưng đặt ngữ cảnh workspace A: RLS vẫn ẩn
    const raw = await web.withActor(wsA, outsider, (tx) =>
      tx.execute(sql`SELECT 1 FROM core.usage_counters WHERE workspace_id = ${wsA}`),
    );
    expect(raw.rows).toHaveLength(0);
  });

  it('FR-090 ngữ cảnh trần (withSystem) không thấy dòng nào', async () => {
    const period = nextPeriod();
    await consume(base(period));
    const raw = await web.withSystem((tx) => tx.execute(sql`SELECT 1 FROM core.usage_counters`));
    expect(raw.rows).toHaveLength(0);
  });

  it('FR-090 CHECK DB: used/limit_amount/addon không âm (chủ bảng cũng không ghi được)', async () => {
    const code = await expectRejectCode(
      admin.query(
        `INSERT INTO core.usage_counters (workspace_id, product, meter, period_start, used)
         VALUES ($1, 'commentflow', 'ai_turns', '2099-01-01', -1)`,
        [wsA],
      ),
    );
    expect(code).toBe('23514');
  });
});
