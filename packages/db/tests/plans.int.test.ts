import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  activatePlan,
  getPlanState,
  getSubscription,
  grantUsageAddon,
  listPlans,
  startTrial,
} from '../src/plans';
import { consumeUsage } from '../src/usage-counters';
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
 * PLANS-SCHEMA (migration 0054, FR-090, US-060, Q-PLN1): `core.plans` (bảng giá, chỉ đọc) và `core.subscriptions`
 * (RLS theo workspace, ghi duy nhất qua hàm DEFINER của `cf_worker`); lượt mua thêm nối với `core.usage_counters`.
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let memberA: string;
let memberB: string;

const DAY = 24 * 3600 * 1000;
const PERIOD = '2026-11-01';
const start = new Date('2026-11-01T00:00:00Z');
const end = new Date('2026-12-01T00:00:00Z');

const trialRow = async (ws: string) =>
  (
    await admin.query(
      'SELECT plan_code, status, period_start, period_end FROM core.subscriptions WHERE workspace_id = $1',
      [ws],
    )
  ).rows[0] as { plan_code: string; status: string; period_start: Date; period_end: Date };

const addonOf = async (ws: string) =>
  (
    await admin.query(
      'SELECT addon, limit_amount FROM core.usage_counters WHERE workspace_id = $1 AND period_start = $2',
      [ws, PERIOD],
    )
  ).rows[0] as { addon: number; limit_amount: number } | undefined;

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  memberA = await seedUser(admin);
  memberB = await seedUser(admin);
  await seedMember(admin, wsA, memberA, 'staff');
  await seedMember(admin, wsB, memberB, 'owner');
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close(), admin.end()]);
});

describe('FR-090 bảng giá core.plans', () => {
  it('có đúng 5 gói CommentFlow theo docs/10 (seed duy nhất ngoài từ điển viết tắt)', async () => {
    const rows = await web.withWorkspace(wsA, (tx) => listPlans(tx, 'commentflow'));
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
    expect(Object.keys(byCode).sort()).toEqual(
      ['addon_1000', 'business', 'growth', 'starter', 'trial'].sort(),
    );
    expect(byCode.trial).toMatchObject({
      kind: 'trial',
      trialDays: 14,
      monthlyTurns: 300,
      priceVnd: 0,
    });
    expect(byCode.starter).toMatchObject({
      priceVnd: 299_000,
      channelsLimit: 1,
      monthlyTurns: 1000,
      autoReplyAllowed: false,
    });
    expect(byCode.growth).toMatchObject({
      priceVnd: 699_000,
      channelsLimit: 3,
      monthlyTurns: 3000,
    });
    expect(byCode.business).toMatchObject({
      priceVnd: 1_490_000,
      channelsLimit: 10,
      monthlyTurns: 7500,
    });
    expect(byCode.addon_1000).toMatchObject({
      kind: 'addon',
      priceVnd: 149_000,
      monthlyTurns: 1000,
    });
    expect(await web.withWorkspace(wsA, (tx) => listPlans(tx, 'excelflow'))).toEqual([]);
  });

  it('cf_app KHÔNG ghi được bảng giá (INSERT/UPDATE/DELETE → 42501)', async () => {
    const run = (query: string) =>
      expectRejectCode(
        web.withWorkspace(wsA, async (tx) => {
          await tx.execute(sql.raw(query));
        }),
      );
    expect(
      await run(
        `INSERT INTO core.plans (product, code, name, kind, price_vnd, channels_limit, monthly_turns) VALUES ('commentflow', 'free_all', 'x', 'base', 0, 99, 999999)`,
      ),
    ).toBe('42501');
    expect(await run(`UPDATE core.plans SET price_vnd = 0 WHERE code = 'growth'`)).toBe('42501');
    expect(await run(`DELETE FROM core.plans WHERE code = 'growth'`)).toBe('42501');
  });

  it('ràng buộc bảng giá: kind trial bắt buộc có trial_days, kind khác không được có (admin ghi thử)', async () => {
    const bad = (kind: string, trialDays: string) =>
      expectRejectCode(
        admin.query(
          `INSERT INTO core.plans (product, code, name, kind, price_vnd, channels_limit, monthly_turns, trial_days)
           VALUES ('commentflow', 'zz_bad', 'x', '${kind}', 0, 1, 1, ${trialDays})`,
        ),
      );
    expect(await bad('trial', 'NULL')).toBe('23514');
    expect(await bad('base', '7')).toBe('23514');
    expect(await bad('free', 'NULL')).toBe('23514');
  });
});

describe('FR-090 dùng thử core.start_trial', () => {
  it('tạo dùng thử 14 ngày/gói trial một lần; gọi lại → exists và không đổi gì', async () => {
    const before = Date.now();
    expect(await worker.withJob(wsA, (tx) => startTrial(tx, wsA, 'commentflow'))).toBe('ok');
    const first = await trialRow(wsA);
    expect(first).toMatchObject({ plan_code: 'trial', status: 'trialing' });
    const days = (first.period_end.getTime() - first.period_start.getTime()) / DAY;
    expect(days).toBe(14);
    expect(first.period_start.getTime()).toBeGreaterThanOrEqual(before - 5000);

    expect(await worker.withJob(wsA, (tx) => startTrial(tx, wsA, 'commentflow'))).toBe('exists');
    expect(await trialRow(wsA)).toEqual(first);
  });

  it('getPlanState: đang dùng thử → hạn mức 300; sau 15 ngày → trial_expired, hạn mức 0', async () => {
    // Dùng đồng hồ của DB (máy ảo có thể lệch máy chạy test) để so với period_end do DB đặt.
    const now = ((await admin.query('SELECT now() AS n')).rows[0] as { n: Date }).n;
    const live = await web.withWorkspace(wsA, (tx) => getPlanState(tx, wsA, 'commentflow', now));
    expect(live).toMatchObject({ state: 'trialing', turnsLimit: 300 });
    expect([13, 14]).toContain(live.trialDaysLeft);
    const later = new Date(now.getTime() + 15 * DAY);
    const expired = await web.withWorkspace(wsA, (tx) =>
      getPlanState(tx, wsA, 'commentflow', later),
    );
    expect(expired).toMatchObject({ state: 'trial_expired', turnsLimit: 0 });
  });

  it('workspace chưa có gói → getPlanState none (hạn mức 0)', async () => {
    const state = await web.withWorkspace(wsB, (tx) =>
      getPlanState(tx, wsB, 'commentflow', new Date()),
    );
    expect(state).toMatchObject({ state: 'none', turnsLimit: 0, autoReplyAllowed: false });
  });

  it('sản phẩm lạ → 22023', async () => {
    expect(await expectRejectCode(worker.withJob(wsB, (tx) => startTrial(tx, wsB, 'tiktok')))).toBe(
      '22023',
    );
  });
});

describe('FR-090 kích hoạt gói core.activate_plan', () => {
  it('đặt gói trả phí thay cả dòng dùng thử; hạn mức theo gói', async () => {
    await worker.withJob(wsA, (tx) =>
      activatePlan(tx, {
        workspaceId: wsA,
        product: 'commentflow',
        planCode: 'growth',
        periodStart: start,
        periodEnd: end,
      }),
    );
    expect(await trialRow(wsA)).toMatchObject({ plan_code: 'growth', status: 'active' });
    const now = new Date('2026-11-15T00:00:00Z');
    const state = await web.withWorkspace(wsA, (tx) => getPlanState(tx, wsA, 'commentflow', now));
    expect(state).toMatchObject({
      state: 'active',
      turnsLimit: 3000,
      channelsLimit: 3,
      autoReplyAllowed: true,
    });
  });

  it('chỉ nhận gói base còn bán: trial/addon/mã lạ/kỳ ngược/kỳ > 400 ngày → 22023', async () => {
    const call = (planCode: string, periodStart = start, periodEnd = end) =>
      expectRejectCode(
        worker.withJob(wsB, (tx) =>
          tx.execute(
            sql`SELECT core.activate_plan(${wsB}::uuid, 'commentflow', ${planCode}::text, ${periodStart.toISOString()}::timestamptz, ${periodEnd.toISOString()}::timestamptz)`,
          ),
        ),
      );
    expect(await call('trial')).toBe('22023');
    expect(await call('addon_1000')).toBe('22023');
    expect(await call('platinum')).toBe('22023');
    expect(await call('starter', end, start)).toBe('22023');
    expect(await call('starter', start, new Date(start.getTime() + 401 * DAY))).toBe('22023');
    expect(await getSubscription_(wsB)).toBeNull();
  });

  it('gói không còn bán (active=false) không kích hoạt được', async () => {
    await admin.query("UPDATE core.plans SET active = false WHERE code = 'business'");
    try {
      const code = await expectRejectCode(
        worker.withJob(wsB, (tx) =>
          activatePlan(tx, {
            workspaceId: wsB,
            product: 'commentflow',
            planCode: 'business',
            periodStart: start,
            periodEnd: end,
          }),
        ),
      );
      expect(code).toBe('22023');
      const listed = await web.withWorkspace(wsB, (tx) => listPlans(tx, 'commentflow'));
      expect(listed.map((p) => p.code)).not.toContain('business');
    } finally {
      await admin.query("UPDATE core.plans SET active = true WHERE code = 'business'");
    }
  });

  it('tầng code từ chối đầu vào sai trước khi chạm DB', async () => {
    await expect(
      worker.withJob(wsB, (tx) =>
        activatePlan(tx, {
          workspaceId: wsB,
          product: 'commentflow',
          planCode: 'starter',
          periodStart: end,
          periodEnd: start,
        }),
      ),
    ).rejects.toThrow();
  });
});

async function getSubscription_(ws: string) {
  return worker.withJob(ws, (tx) => getSubscription(tx, ws, 'commentflow'));
}

describe('FR-090 RLS core.subscriptions', () => {
  it('thành viên đọc gói của đúng workspace; workspace khác không thấy (0 dòng)', async () => {
    const own = await web.withActor(wsA, memberA, (tx) => getSubscription(tx, wsA, 'commentflow'));
    expect(own).toMatchObject({ planCode: 'growth', status: 'active' });
    expect(
      await web.withActor(wsB, memberB, (tx) => getSubscription(tx, wsA, 'commentflow')),
    ).toBeNull();
    expect(
      await web.withWorkspace(wsB, (tx) => getSubscription(tx, wsA, 'commentflow')),
    ).toBeNull();
  });

  it('người dùng không phải thành viên workspace không đọc được gói', async () => {
    expect(
      await web.withActor(wsA, memberB, (tx) => getSubscription(tx, wsA, 'commentflow')),
    ).toBeNull();
  });

  it('cf_app KHÔNG ghi trực tiếp subscriptions (INSERT/UPDATE/DELETE → 42501)', async () => {
    const run = (query: string) =>
      expectRejectCode(
        web.withActor(wsA, memberA, async (tx) => {
          await tx.execute(sql.raw(query));
        }),
      );
    expect(
      await run(
        `INSERT INTO core.subscriptions (workspace_id, product, plan_code, status, period_start, period_end) VALUES ('${wsB}', 'commentflow', 'business', 'active', now(), now() + interval '30 days')`,
      ),
    ).toBe('42501');
    expect(
      await run(
        `UPDATE core.subscriptions SET plan_code = 'business' WHERE workspace_id = '${wsA}'`,
      ),
    ).toBe('42501');
    expect(await run(`DELETE FROM core.subscriptions WHERE workspace_id = '${wsA}'`)).toBe('42501');
    expect((await trialRow(wsA)).plan_code).toBe('growth');
  });

  it('ràng buộc: gói không có trong bảng giá, kỳ ngược, một dòng/(workspace, sản phẩm)', async () => {
    const ins = (planCode: string, periodEnd: string) =>
      expectRejectCode(
        admin.query(
          `INSERT INTO core.subscriptions (workspace_id, product, plan_code, status, period_start, period_end)
           VALUES ('${wsB}', 'commentflow', '${planCode}', 'active', '2026-11-01', '${periodEnd}')`,
        ),
      );
    expect(await ins('platinum', '2026-12-01')).toBe('23503');
    expect(await ins('starter', '2026-10-01')).toBe('23514');
    expect(
      await expectRejectCode(
        admin.query(
          `INSERT INTO core.subscriptions (workspace_id, product, plan_code, status, period_start, period_end)
           VALUES ('${wsA}', 'commentflow', 'starter', 'active', '2026-11-01', '2026-12-01')`,
        ),
      ),
    ).toBe('23505');
  });
});

describe('FR-090 quyền gọi hàm ghi gói (chỉ withJob đúng workspace trên cf_worker)', () => {
  it('web (cf_app) không gọi được start_trial/activate_plan/grant_usage_addon (42501)', async () => {
    expect(
      await expectRejectCode(web.withJob(wsB, (tx) => startTrial(tx, wsB, 'commentflow'))),
    ).toBe('42501');
    expect(
      await expectRejectCode(
        web.withJob(wsB, (tx) =>
          activatePlan(tx, {
            workspaceId: wsB,
            product: 'commentflow',
            planCode: 'business',
            periodStart: start,
            periodEnd: end,
          }),
        ),
      ),
    ).toBe('42501');
    expect(
      await expectRejectCode(
        web.withJob(wsB, (tx) =>
          grantUsageAddon(tx, {
            workspaceId: wsB,
            product: 'commentflow',
            meter: 'ai_turns',
            periodStart: PERIOD,
            addonCode: 'addon_1000',
            quantity: 1,
          }),
        ),
      ),
    ).toBe('42501');
  });

  it('job của workspace A không ghi gói/lượt cho workspace B (42501); người dùng (withActor) cũng không', async () => {
    expect(
      await expectRejectCode(worker.withJob(wsA, (tx) => startTrial(tx, wsB, 'commentflow'))),
    ).toBe('42501');
    expect(
      await expectRejectCode(
        worker.withJob(wsA, (tx) =>
          grantUsageAddon(tx, {
            workspaceId: wsB,
            product: 'commentflow',
            meter: 'ai_turns',
            periodStart: PERIOD,
            addonCode: 'addon_1000',
            quantity: 1,
          }),
        ),
      ),
    ).toBe('42501');
    expect(
      await expectRejectCode(
        worker.withActor(wsB, memberB, (tx) => startTrial(tx, wsB, 'commentflow')),
      ),
    ).toBe('42501');
    expect(await getSubscription_(wsB)).toBeNull();
    expect(await addonOf(wsB)).toBeUndefined();
  });
});

describe('FR-090 mua thêm lượt core.grant_usage_addon + usage_counters', () => {
  const grant = (ws: string, quantity: number, addonCode = 'addon_1000', periodStart = PERIOD) =>
    worker.withJob(ws, (tx) =>
      grantUsageAddon(tx, {
        workspaceId: ws,
        product: 'commentflow',
        meter: 'ai_turns',
        periodStart,
        addonCode,
        quantity,
      }),
    );

  it('cộng đúng monthly_turns × số lượng, cộng dồn, và consume_usage dùng được ngay', async () => {
    expect(await grant(wsA, 1)).toBe(1000);
    expect(await grant(wsA, 2)).toBe(3000);
    expect(await addonOf(wsA)).toEqual({ addon: 3000, limit_amount: 0 });

    // Hạn mức gói 5 + addon 3000: lượt thứ 6 vẫn được phép nhờ lượt mua thêm.
    const outcomes = [];
    for (let i = 0; i < 6; i += 1) {
      outcomes.push(
        await worker.withJob(wsA, (tx) =>
          consumeUsage(tx, {
            workspaceId: wsA,
            product: 'commentflow',
            meter: 'ai_turns',
            amount: 1,
            periodStart: PERIOD,
            limit: 5,
          }),
        ),
      );
    }
    expect(outcomes.every((o) => o.allowed)).toBe(true);
    expect(outcomes[5]).toMatchObject({ used: 6, addon: 3000, limit: 5 });
  });

  it('chỉ nhận gói addon còn bán, số lượng 1–1000, kỳ ngày 1 → còn lại 22023', async () => {
    // Mã không phải addon_*: tầng code chặn trước; gọi thẳng hàm DB với gói base → DB chặn (22023).
    expect(await expectRejectCode(grant(wsA, 1, 'growth'))).toBe('VALIDATION_FAILED');
    expect(
      await expectRejectCode(
        worker.withJob(wsA, (tx) =>
          tx.execute(
            sql`SELECT core.grant_usage_addon(${wsA}::uuid, 'commentflow', 'ai_turns', '2026-11-01'::date, 'growth', 1)`,
          ),
        ),
      ),
    ).toBe('22023');
    expect(await expectRejectCode(grant(wsA, 1, 'addon_9999'))).toBe('22023');
    expect(
      await expectRejectCode(
        worker.withJob(wsA, (tx) =>
          tx.execute(
            sql`SELECT core.grant_usage_addon(${wsA}::uuid, 'commentflow', 'ai_turns', '2026-11-01'::date, 'addon_1000', 0)`,
          ),
        ),
      ),
    ).toBe('22023');
    expect(
      await expectRejectCode(
        worker.withJob(wsA, (tx) =>
          tx.execute(
            sql`SELECT core.grant_usage_addon(${wsA}::uuid, 'commentflow', 'ai_turns', '2026-11-15'::date, 'addon_1000', 1)`,
          ),
        ),
      ),
    ).toBe('22023');
    expect(await addonOf(wsA)).toMatchObject({ addon: 3000 });
  });

  it('tổng lượt thêm tối đa 1.000.000.000: vượt → 22023, không đổi gì', async () => {
    await admin.query(
      'UPDATE core.usage_counters SET addon = 999999500 WHERE workspace_id = $1 AND period_start = $2',
      [wsA, PERIOD],
    );
    expect(await expectRejectCode(grant(wsA, 1))).toBe('22023');
    expect(await addonOf(wsA)).toMatchObject({ addon: 999_999_500 });
  });

  it('hai lần mua đua nhau không mất lượt (khóa dòng)', async () => {
    await Promise.all([grant(wsB, 1), grant(wsB, 1), grant(wsB, 1)]);
    expect(await addonOf(wsB)).toMatchObject({ addon: 3000 });
  });
});
