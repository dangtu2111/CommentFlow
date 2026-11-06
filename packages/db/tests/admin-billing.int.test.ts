import { evaluateCoupon } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, FlowDb } from '../src/client';
import {
  applyCoupon,
  createCoupon,
  listCoupons,
  updateCoupon,
  updatePlanAsAdmin,
} from '../src/queries/admin-billing';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * ADMIN-REST phần dữ liệu (migration 0060, FR-104, Q-ADP1): gói cước chỉ Super Admin sửa; mã giảm giá RLS hệ thống
 * (web không đọc trực tiếp), Super + Finance xem, Super tạo/sửa; Owner áp mã với kiểm hạn dùng, trần lượt, cô lập workspace.
 */
const RLS = '42501';
const DAY = 24 * 3_600_000;
const tag = Date.now().toString(36).toUpperCase();

let admin: pg.Pool;
let db: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let ownerA: string;
let ownerB: string;
let staffA: string;
let superAdmin: string;
let financeAdmin: string;
let supportAdmin: string;

async function seedAdmin(role: string): Promise<string> {
  const id = await seedUser(admin, `admin-${role}`);
  await admin.query('UPDATE core.users SET is_admin = true, admin_role = $2 WHERE id = $1', [
    id,
    role,
  ]);
  return id;
}

const couponInput = (code: string, over: Record<string, unknown> = {}) => ({
  code,
  product: 'commentflow',
  discountType: 'percent',
  discountValue: 20,
  appliesPlanCodes: null,
  validFrom: new Date(Date.now() - DAY),
  validUntil: new Date(Date.now() + 30 * DAY),
  maxRedemptions: null,
  perWorkspaceLimit: 1,
  note: '',
  ...over,
});
const asSuper = <T>(fn: (tx: Database) => Promise<T>) => db.withUser(superAdmin, fn);
const apply = (ws: string, user: string, code: string, plan = 'growth') =>
  db.withActor(ws, user, (tx) =>
    applyCoupon(tx, ws, { code, product: 'commentflow', planCode: plan }),
  );

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(4);
  worker = createWorkerDb(2);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  ownerA = await seedUser(admin, 'ownerA');
  ownerB = await seedUser(admin, 'ownerB');
  staffA = await seedUser(admin, 'staffA');
  await seedMember(admin, wsA, ownerA, 'owner');
  await seedMember(admin, wsB, ownerB, 'owner');
  await seedMember(admin, wsA, staffA, 'staff');
  superAdmin = await seedAdmin('super');
  financeAdmin = await seedAdmin('finance');
  supportAdmin = await seedAdmin('support');
});

afterAll(async () => {
  await db.close();
  await worker.close();
  await admin.end();
});

describe('gói cước', () => {
  const edit = (over: Record<string, unknown> = {}) => ({
    product: 'commentflow',
    code: 'starter',
    name: 'Starter',
    priceVnd: 299_000,
    channelsLimit: 1,
    monthlyTurns: 1000,
    autoReplyAllowed: false,
    active: true,
    ...over,
  });

  it('Super Admin sửa được và dữ liệu thật đổi; hoàn lại giá cũ', async () => {
    await asSuper((tx) => updatePlanAsAdmin(tx, edit({ priceVnd: 310_000 })));
    const row = await admin.query(
      "SELECT price_vnd FROM core.plans WHERE product='commentflow' AND code='starter'",
    );
    expect(row.rows[0].price_vnd).toBe(310_000);
    await asSuper((tx) => updatePlanAsAdmin(tx, edit()));
  });

  it('Finance, Support, Owner, không người dùng, hệ thống: 42501', async () => {
    for (const who of [financeAdmin, supportAdmin, ownerA]) {
      expect(await expectRejectCode(db.withUser(who, (tx) => updatePlanAsAdmin(tx, edit())))).toBe(
        RLS,
      );
    }
    expect(
      await expectRejectCode(db.withActor(wsA, superAdmin, (tx) => updatePlanAsAdmin(tx, edit()))),
    ).toBe(RLS);
    expect(await expectRejectCode(db.withJob(wsA, (tx) => updatePlanAsAdmin(tx, edit())))).toBe(
      RLS,
    );
  });

  it('gói không tồn tại → P0002; số liệu sai bị chặn ở TS', async () => {
    expect(
      await expectRejectCode(asSuper((tx) => updatePlanAsAdmin(tx, edit({ code: 'khong_co' })))),
    ).toBe('P0002');
    await expect(asSuper((tx) => updatePlanAsAdmin(tx, edit({ priceVnd: -1 })))).rejects.toThrow();
  });
});

describe('mã giảm giá: quyền và RLS', () => {
  it('Super tạo; Finance và Super xem; Support/Owner/không user không xem/tạo được', async () => {
    const code = `T1${tag}`;
    await asSuper((tx) => createCoupon(tx, couponInput(code)));
    for (const who of [superAdmin, financeAdmin]) {
      const rows = await db.withUser(who, (tx) => listCoupons(tx, 200));
      expect(rows.some((r) => r.code === code)).toBe(true);
    }
    for (const who of [supportAdmin, ownerA]) {
      expect(await expectRejectCode(db.withUser(who, (tx) => listCoupons(tx)))).toBe(RLS);
    }
    for (const who of [financeAdmin, supportAdmin, ownerA]) {
      expect(
        await expectRejectCode(
          db.withUser(who, (tx) => createCoupon(tx, couponInput(`T1X${tag}`))),
        ),
      ).toBe(RLS);
    }
  });

  it('web (cf_app) không đọc/ghi thẳng bảng coupons; worker cũng không', async () => {
    for (const handle of [db, worker]) {
      expect(
        await expectRejectCode(
          handle.withWorkspace(wsA, (tx) => tx.execute(sql`SELECT * FROM core.coupons`)),
        ),
      ).toBe(RLS);
    }
    expect(
      await expectRejectCode(
        db.withActor(wsA, ownerA, (tx) =>
          tx.execute(
            sql`INSERT INTO core.coupons (code, product, discount_type, discount_value, valid_from) VALUES ('HACK1','commentflow','percent',100,now())`,
          ),
        ),
      ),
    ).toBe(RLS);
  });

  it('mã trùng → 23505; mã trỏ gói không tồn tại → 22023', async () => {
    const code = `T2${tag}`;
    await asSuper((tx) => createCoupon(tx, couponInput(code)));
    expect(
      await expectRejectCode(asSuper((tx) => createCoupon(tx, couponInput(code.toLowerCase())))),
    ).toBe('23505');
    expect(
      await expectRejectCode(
        asSuper((tx) =>
          createCoupon(tx, couponInput(`T2B${tag}`, { appliesPlanCodes: ['khong_co'] })),
        ),
      ),
    ).toBe('22023');
  });
});

describe('áp mã', () => {
  it('Owner áp được: giảm đúng, ghi lượt, tăng đếm; mức giảm khớp evaluateCoupon', async () => {
    const code = `A1${tag}`;
    await asSuper((tx) => createCoupon(tx, couponInput(code)));
    const r = await apply(wsA, ownerA, code.toLowerCase());
    const plan = (
      await admin.query(
        "SELECT price_vnd FROM core.plans WHERE product='commentflow' AND code='growth'",
      )
    ).rows[0];
    const expected = evaluateCoupon(
      {
        product: 'commentflow',
        discountType: 'percent',
        discountValue: 20,
        appliesPlanCodes: null,
        validFrom: new Date(0),
        validUntil: null,
        maxRedemptions: null,
        redemptionCount: 0,
        perWorkspaceLimit: 1,
        active: true,
      },
      {
        now: new Date(),
        plan: { product: 'commentflow', code: 'growth', kind: 'base', priceVnd: plan.price_vnd },
        workspaceRedemptions: 0,
      },
    );
    expect(expected.ok).toBe(true);
    expect(r).toEqual({
      applied: true,
      discountVnd: (expected as { discountVnd: number }).discountVnd,
      finalPriceVnd: (expected as { finalPriceVnd: number }).finalPriceVnd,
    });
    const counts = await admin.query('SELECT redemption_count FROM core.coupons WHERE code = $1', [
      code,
    ]);
    expect(counts.rows[0].redemption_count).toBe(1);
  });

  it('giới hạn mỗi workspace: lần 2 bị từ chối; workspace khác vẫn dùng được', async () => {
    const code = `A2${tag}`;
    await asSuper((tx) => createCoupon(tx, couponInput(code)));
    expect((await apply(wsA, ownerA, code)).applied).toBe(true);
    expect(await apply(wsA, ownerA, code)).toEqual({
      applied: false,
      reason: 'workspace_limit_reached',
    });
    expect((await apply(wsB, ownerB, code)).applied).toBe(true);
  });

  it('trần tổng: song song 5 workspace cho mã tối đa 2 lượt → đúng 2 thành công', async () => {
    const code = `A3${tag}`;
    await asSuper((tx) => createCoupon(tx, couponInput(code, { maxRedemptions: 2 })));
    const spaces = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const ws = await seedWorkspace(admin);
        const owner = await seedUser(admin, 'o');
        await seedMember(admin, ws, owner, 'owner');
        return { ws, owner };
      }),
    );
    const results = await Promise.all(spaces.map((s) => apply(s.ws, s.owner, code)));
    expect(results.filter((r) => r.applied)).toHaveLength(2);
    expect(
      results.filter((r) => !r.applied).every((r) => !r.applied && r.reason === 'exhausted'),
    ).toBe(true);
    const row = await admin.query('SELECT redemption_count FROM core.coupons WHERE code = $1', [
      code,
    ]);
    expect(row.rows[0].redemption_count).toBe(2);
  });

  it('hạn dùng: chưa bắt đầu, hết hạn, tắt, sai sản phẩm/gói, không tồn tại', async () => {
    const future = `A4${tag}`;
    const past = `A5${tag}`;
    const off = `A6${tag}`;
    const only = `A7${tag}`;
    await asSuper(async (tx) => {
      await createCoupon(
        tx,
        couponInput(future, { validFrom: new Date(Date.now() + DAY), validUntil: null }),
      );
      await createCoupon(
        tx,
        couponInput(past, {
          validFrom: new Date(Date.now() - 3 * DAY),
          validUntil: new Date(Date.now() - DAY),
        }),
      );
      await createCoupon(tx, couponInput(off));
      await createCoupon(tx, couponInput(only, { appliesPlanCodes: ['business'] }));
    });
    const offId = (await admin.query('SELECT id FROM core.coupons WHERE code = $1', [off])).rows[0]
      .id as string;
    await asSuper((tx) =>
      updateCoupon(tx, {
        id: offId,
        active: false,
        validUntil: null,
        maxRedemptions: null,
        note: 'tắt',
      }),
    );
    expect(await apply(wsA, ownerA, future)).toEqual({ applied: false, reason: 'not_started' });
    expect(await apply(wsA, ownerA, past)).toEqual({ applied: false, reason: 'expired' });
    expect(await apply(wsA, ownerA, off)).toEqual({ applied: false, reason: 'inactive' });
    expect(await apply(wsA, ownerA, only, 'growth')).toEqual({
      applied: false,
      reason: 'plan_not_eligible',
    });
    expect(await apply(wsA, ownerA, only, 'trial')).toEqual({
      applied: false,
      reason: 'plan_not_eligible',
    });
    expect(await apply(wsA, ownerA, `KHONGCO${tag}`)).toEqual({
      applied: false,
      reason: 'not_found',
    });
    expect((await apply(wsA, ownerA, only, 'business')).applied).toBe(true);
  });

  it('Staff, thành viên workspace khác, workspace không khớp ngữ cảnh, hệ thống: 42501', async () => {
    const code = `A8${tag}`;
    await asSuper((tx) => createCoupon(tx, couponInput(code)));
    expect(await expectRejectCode(apply(wsA, staffA, code))).toBe(RLS);
    expect(
      await expectRejectCode(
        db.withActor(wsA, ownerB, (tx) =>
          applyCoupon(tx, wsA, { code, product: 'commentflow', planCode: 'growth' }),
        ),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        db.withActor(wsA, ownerA, (tx) =>
          applyCoupon(tx, wsB, { code, product: 'commentflow', planCode: 'growth' }),
        ),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        db.withJob(wsA, (tx) =>
          applyCoupon(tx, wsA, { code, product: 'commentflow', planCode: 'growth' }),
        ),
      ),
    ).toBe(RLS);
    expect(await expectRejectCode(apply(wsA, superAdmin, code))).toBe(RLS);
  });

  it('lượt dùng cô lập workspace (RLS): A không thấy lượt của B', async () => {
    const code = `A9${tag}`;
    await asSuper((tx) => createCoupon(tx, couponInput(code)));
    await apply(wsB, ownerB, code);
    const seenByA = await db.withActor(wsA, ownerA, (tx) =>
      tx.execute(sql`SELECT 1 FROM core.coupon_redemptions WHERE workspace_id = ${wsB}::uuid`),
    );
    expect(seenByA.rows).toHaveLength(0);
    const ownRows = await db.withActor(wsB, ownerB, (tx) =>
      tx.execute(sql`SELECT 1 FROM core.coupon_redemptions`),
    );
    expect(ownRows.rows.length).toBeGreaterThan(0);
    // Dữ liệu thanh toán: Staff cùng workspace không đọc được lượt dùng mã (docs/13 §3.1).
    const staffSees = await db.withActor(wsA, staffA, (tx) =>
      tx.execute(sql`SELECT 1 FROM core.coupon_redemptions`),
    );
    expect(staffSees.rows).toHaveLength(0);
  });
});

describe('sửa mã', () => {
  it('trần lượt không thấp hơn số đã dùng; Finance không sửa được', async () => {
    const code = `U1${tag}`;
    const id = await asSuper((tx) => createCoupon(tx, couponInput(code, { maxRedemptions: 5 })));
    await apply(wsA, ownerA, code);
    await apply(wsB, ownerB, code);
    // Thấp hơn số đã dùng (2) → 22023; số không hợp lệ bị Zod chặn trước khi tới DB.
    expect(
      await expectRejectCode(
        asSuper((tx) =>
          updateCoupon(tx, { id, active: true, validUntil: null, maxRedemptions: 1, note: '' }),
        ),
      ),
    ).toBe('22023');
    await expect(
      asSuper((tx) =>
        updateCoupon(tx, { id, active: true, validUntil: null, maxRedemptions: 0, note: '' }),
      ),
    ).rejects.toThrow();
    // Hạn dùng không sau ngày bắt đầu → 22023 (không phải 23514).
    expect(
      await expectRejectCode(
        asSuper((tx) =>
          updateCoupon(tx, {
            id,
            active: true,
            validUntil: new Date(0),
            maxRedemptions: 5,
            note: '',
          }),
        ),
      ),
    ).toBe('22023');
    await asSuper((tx) =>
      updateCoupon(tx, { id, active: true, validUntil: null, maxRedemptions: 2, note: 'ok' }),
    );
    const wsC = await seedWorkspace(admin);
    const ownerC = await seedUser(admin, 'ownerC');
    await seedMember(admin, wsC, ownerC, 'owner');
    expect(await apply(wsC, ownerC, code)).toEqual({ applied: false, reason: 'exhausted' });
    expect(
      await expectRejectCode(
        db.withUser(financeAdmin, (tx) =>
          updateCoupon(tx, { id, active: false, validUntil: null, maxRedemptions: null, note: '' }),
        ),
      ),
    ).toBe(RLS);
  });
});
