import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthDb } from '../src/auth-db';
import type { FlowDb } from '../src/client';
import { accounts, sessions, twoFactors, users, verifications } from '../src/schema/core';
import {
  createAdminPool,
  createAppDb,
  createAuthTestDb,
  createContextlessAuthPool,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

const RLS_OR_PRIVILEGE_DENIED = '42501';
const HOUR = 3600 * 1000;

let admin: pg.Pool;
let db: FlowDb; // cf_app
let authDb: AuthDb; // cf_auth + app.ctx = 'auth'
let authNoCtx: pg.Pool; // cf_auth nhưng KHÔNG có app.ctx
let u1: string; // thành viên active của W
let u2: string; // thành viên đã removed của W
let u3: string; // người ngoài W (thành viên của W2)
let ws: string;
let ws2: string;
let verificationIds: string[];

async function seedSession(userId: string) {
  await admin.query(
    "INSERT INTO core.sessions (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 day')",
    [userId, randomUUID()],
  );
}
async function seedAccount(userId: string) {
  await admin.query(
    "INSERT INTO core.accounts (user_id, provider_id, account_id, password) VALUES ($1, 'credential', $2, 'hash-gia')",
    [userId, userId],
  );
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(1); // 1 kết nối: ép dùng lại cùng kết nối để bắt rò ngữ cảnh
  authDb = createAuthTestDb(2);
  authNoCtx = createContextlessAuthPool();
  [u1, u2, u3] = [await seedUser(admin), await seedUser(admin), await seedUser(admin)];
  ws = await seedWorkspace(admin);
  ws2 = await seedWorkspace(admin);
  await seedMember(admin, ws, u1, 'owner');
  const m2 = await seedMember(admin, ws, u2, 'staff');
  await admin.query("UPDATE core.members SET status = 'removed' WHERE id = $1", [m2]);
  await seedMember(admin, ws2, u3, 'owner');
  for (const u of [u1, u2, u3]) {
    await seedSession(u);
    await seedAccount(u);
  }
  verificationIds = [];
  for (let i = 0; i < 2; i++) {
    const { rows } = await admin.query(
      "INSERT INTO core.verifications (identifier, value, expires_at) VALUES ($1, 'v', now() + interval '1 hour') RETURNING id",
      [`dinh-danh-${i}-${randomUUID()}`],
    );
    verificationIds.push(rows[0].id as string);
  }
});
afterAll(async () => {
  await db.close();
  await authDb.close();
  await authNoCtx.end();
  await admin.end();
});

const seededUsers = () => [u1, u2, u3];

// Cột cf_app được đọc (không gồm token / mật khẩu).
const safeSession = { userId: sessions.userId };
const safeAccount = { userId: accounts.userId };

describe('cf_app KHÔNG có ngữ cảnh → không thấy dòng nào (âm tính)', () => {
  it('db.system và withSystem đọc users/sessions/accounts đều 0 dòng', async () => {
    expect(await db.system.select({ id: users.id }).from(users)).toHaveLength(0);
    expect(await db.system.select(safeSession).from(sessions)).toHaveLength(0);
    expect(await db.system.select(safeAccount).from(accounts)).toHaveLength(0);
    const viaSystem = await db.withSystem(async (tx) => ({
      u: await tx.select({ id: users.id }).from(users),
      s: await tx.select(safeSession).from(sessions),
      a: await tx.select(safeAccount).from(accounts),
    }));
    expect([viaSystem.u.length, viaSystem.s.length, viaSystem.a.length]).toEqual([0, 0, 0]);
  });

  it('verifications: cf_app không có quyền nào (từ chối quyền, không chỉ 0 dòng)', async () => {
    expect(await expectRejectCode(db.system.select().from(verifications))).toBe(
      RLS_OR_PRIVILEGE_DENIED,
    );
    expect(
      await expectRejectCode(
        db.system
          .insert(verifications)
          .values({ identifier: 'x', value: 'y', expiresAt: new Date(Date.now() + HOUR) }),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
  });

  it('two_factors (secret TOTP + mã dự phòng đã mã hóa): cf_app không có quyền nào, kể cả đọc dòng của chính mình', async () => {
    await admin.query(
      "INSERT INTO core.two_factors (user_id, secret, backup_codes) VALUES ($1, 'bi-mat-gia', 'ma-gia')",
      [u1],
    );
    expect(await expectRejectCode(db.system.select().from(twoFactors))).toBe(
      RLS_OR_PRIVILEGE_DENIED,
    );
    expect(await expectRejectCode(db.withUser(u1, (tx) => tx.select().from(twoFactors)))).toBe(
      RLS_OR_PRIVILEGE_DENIED,
    );
    expect(await expectRejectCode(db.withWorkspace(ws, (tx) => tx.select().from(twoFactors)))).toBe(
      RLS_OR_PRIVILEGE_DENIED,
    );
    expect(
      await expectRejectCode(
        db.system.insert(twoFactors).values({ userId: u1, secret: 'x', backupCodes: 'y' }),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
  });

  it('two_factors: mỗi user đúng một dòng (UNIQUE user_id) — chèn dòng thứ hai bị từ chối (23505)', async () => {
    const u = await seedUser(admin);
    await admin.query(
      "INSERT INTO core.two_factors (user_id, secret, backup_codes) VALUES ($1, 'a', 'b')",
      [u],
    );
    await expect(
      admin.query(
        "INSERT INTO core.two_factors (user_id, secret, backup_codes) VALUES ($1, 'c', 'd')",
        [u],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('two_factors: cf_auth chỉ đọc/ghi được khi có app.ctx = auth (thiếu ngữ cảnh → 0 dòng, ghi bị từ chối)', async () => {
    const own = await seedUser(admin); // tự seed, không dựa vào test trước
    await admin.query(
      "INSERT INTO core.two_factors (user_id, secret, backup_codes) VALUES ($1, 's', 'k')",
      [own],
    );
    const withCtx = await authDb.transaction((tx) =>
      tx.select({ id: twoFactors.id }).from(twoFactors).where(eq(twoFactors.userId, own)),
    );
    expect(withCtx.length).toBeGreaterThan(0);
    const { rows } = await authNoCtx.query('SELECT count(*)::int AS n FROM core.two_factors');
    expect(rows[0].n).toBe(0);
    await expect(
      authNoCtx.query(
        "INSERT INTO core.two_factors (user_id, secret, backup_codes) VALUES ($1, 'x', 'y')",
        [own],
      ),
    ).rejects.toMatchObject({ code: RLS_OR_PRIVILEGE_DENIED });
  });

  it('không ghi được: chèn users/sessions/accounts bị từ chối; sửa users 0 dòng; xóa sessions bị từ chối', async () => {
    const id = randomUUID();
    expect(
      await expectRejectCode(
        db.system.insert(users).values({ id, email: `${id}@example.test`, name: 'x' }),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
    expect(
      await expectRejectCode(
        db.system
          .insert(sessions)
          .values({ userId: u1, token: randomUUID(), expiresAt: new Date(Date.now() + HOUR) }),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
    expect(
      await expectRejectCode(
        db.system.insert(accounts).values({ userId: u1, providerId: 'x', accountId: randomUUID() }),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
    expect(
      await db.system
        .update(users)
        .set({ name: 'đổi' })
        .where(eq(users.id, u1))
        .returning({ id: users.id }),
    ).toHaveLength(0);
    expect(await expectRejectCode(db.system.delete(sessions).where(eq(sessions.userId, u1)))).toBe(
      RLS_OR_PRIVILEGE_DENIED,
    );
  });

  it('cf_app không thể tự vào ngữ cảnh auth bằng cách đặt app.ctx (không còn policy nào đọc app.ctx cho cf_app)', async () => {
    const r = await db.withSystem(async (tx) => {
      await tx.execute(sql`select set_config('app.ctx', 'auth', true)`);
      return {
        u: await tx.select({ id: users.id }).from(users).where(inArray(users.id, seededUsers())),
        s: await tx.select(safeSession).from(sessions),
        a: await tx.select(safeAccount).from(accounts),
      };
    });
    expect([r.u.length, r.s.length, r.a.length]).toEqual([0, 0, 0]);
  });
});

describe('cf_auth cần CẢ role lẫn app.ctx', () => {
  it('pool cf_auth có app.ctx = auth thấy và ghi được tất cả (đọc cả token/băm mật khẩu)', async () => {
    const all = await authDb.transaction(async (tx) => ({
      u: await tx.select().from(users).where(inArray(users.id, seededUsers())),
      s: await tx.select().from(sessions).where(inArray(sessions.userId, seededUsers())),
      a: await tx.select().from(accounts).where(inArray(accounts.userId, seededUsers())),
      v: await tx.select().from(verifications).where(inArray(verifications.id, verificationIds)),
    }));
    expect([all.u.length, all.s.length, all.a.length, all.v.length]).toEqual([3, 3, 3, 2]);
    const id = randomUUID();
    await authDb.db.insert(users).values({ id, email: `${id}@example.test`, name: 'Qua adapter' });
    expect(await authDb.db.select().from(users).where(eq(users.id, id))).toHaveLength(1);
  });

  it('cf_auth nhưng KHÔNG có app.ctx → 0 dòng ở mọi bảng xác thực, và không chèn được', async () => {
    for (const table of ['users', 'sessions', 'accounts', 'verifications']) {
      const { rows } = await authNoCtx.query(`SELECT count(*)::int AS n FROM core.${table}`);
      expect(rows[0].n, table).toBe(0);
    }
    const id = randomUUID();
    expect(
      await expectRejectCode(
        authNoCtx.query('INSERT INTO core.users (id, email, name) VALUES ($1, $2, $3)', [
          id,
          `${id}@example.test`,
          'x',
        ]),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
  });

  it('app.ctx đặt trong giao dịch không rò sang giao dịch sau (pool 1 kết nối)', async () => {
    const single = createAuthTestDb(1);
    try {
      await single.transaction((tx) => tx.select().from(sessions));
      const setting = await single.db.execute(sql`select current_setting('app.ctx', true) as ctx`);
      // Pool cf_auth luôn có app.ctx = auth ở cấp kết nối (tham số khởi động) — đây là thiết kế;
      // điều cần bảo đảm là NO_CONTEXT đặt lại các biến workspace/user:
      expect(setting.rows[0]?.ctx).toBe('auth');
      const ws2Setting = await single.transaction((tx) =>
        tx.execute(sql`select current_setting('app.workspace_id', true) as w`),
      );
      expect([null, '']).toContain(ws2Setting.rows[0]?.w);
    } finally {
      await single.close();
    }
  });
});

describe('withUser(u): chỉ ĐỌC dòng của mình; chỉ GHI users.name/image/locale', () => {
  it('thấy đúng dòng của mình ở users/sessions/accounts (cột không nhạy cảm)', async () => {
    const r = await db.withUser(u1, async (tx) => ({
      u: await tx.select({ id: users.id }).from(users),
      s: await tx.select(safeSession).from(sessions),
      a: await tx.select(safeAccount).from(accounts),
    }));
    expect(r.u.map((x) => x.id)).toEqual([u1]);
    expect(r.s.every((x) => x.userId === u1)).toBe(true);
    expect(r.s.length).toBeGreaterThan(0);
    expect(r.a.every((x) => x.userId === u1)).toBe(true);
    expect(r.a.length).toBeGreaterThan(0);
  });

  it('KHÔNG đọc được cột nhạy cảm của chính mình: sessions.token, accounts.password / access_token / refresh_token / id_token', async () => {
    for (const run of [
      () => db.withUser(u1, (tx) => tx.select({ t: sessions.token }).from(sessions)),
      () => db.withUser(u1, (tx) => tx.select({ p: accounts.password }).from(accounts)),
      () => db.withUser(u1, (tx) => tx.select({ p: accounts.accessToken }).from(accounts)),
      () => db.withUser(u1, (tx) => tx.select({ p: accounts.refreshToken }).from(accounts)),
      () => db.withUser(u1, (tx) => tx.select({ p: accounts.idToken }).from(accounts)),
      // select() không cột = chọn tất cả cột, gồm cột nhạy cảm
      () => db.withUser(u1, (tx) => tx.select().from(sessions)),
      () => db.withUser(u1, (tx) => tx.select().from(accounts)),
    ]) {
      expect(await expectRejectCode(run())).toBe(RLS_OR_PRIVILEGE_DENIED);
    }
  });

  it('verifications: không có quyền nào', async () => {
    expect(await expectRejectCode(db.withUser(u1, (tx) => tx.select().from(verifications)))).toBe(
      RLS_OR_PRIVILEGE_DENIED,
    );
  });

  it('sửa được users.name / image / locale của mình; không sửa được dòng của người khác', async () => {
    expect(
      await db.withUser(u1, (tx) =>
        tx
          .update(users)
          .set({ name: 'Tên mới', image: 'https://example.test/a.png', locale: 'en' })
          .where(eq(users.id, u1))
          .returning({ id: users.id }),
      ),
    ).toHaveLength(1);
    expect(
      await db.withUser(u1, (tx) =>
        tx.update(users).set({ name: 'Hack' }).where(eq(users.id, u3)).returning({ id: users.id }),
      ),
    ).toHaveLength(0);
  });

  it('KHÔNG sửa được email, email_verified, totp_enabled, is_admin, admin_role (từ chối quyền cột)', async () => {
    for (const change of [
      { email: `${randomUUID()}@example.test` },
      { emailVerified: true },
      { twoFactorEnabled: true },
      { isAdmin: true },
      { adminRole: 'super' },
    ]) {
      expect(
        await expectRejectCode(
          db.withUser(u1, (tx) => tx.update(users).set(change).where(eq(users.id, u1))),
        ),
        JSON.stringify(change),
      ).toBe(RLS_OR_PRIVILEGE_DENIED);
    }
  });

  it('KHÔNG đổi được mật khẩu / ghi accounts, KHÔNG tạo hay xóa phiên, KHÔNG chèn/xóa users', async () => {
    const id = randomUUID();
    const attempts = [
      () =>
        db.withUser(u1, (tx) =>
          tx.update(accounts).set({ password: 'hash-moi' }).where(eq(accounts.userId, u1)),
        ),
      () =>
        db.withUser(u1, (tx) =>
          tx.insert(accounts).values({ userId: u1, providerId: 'x', accountId: randomUUID() }),
        ),
      () => db.withUser(u1, (tx) => tx.delete(accounts).where(eq(accounts.userId, u1))),
      () =>
        db.withUser(u1, (tx) =>
          tx
            .insert(sessions)
            .values({ userId: u1, token: randomUUID(), expiresAt: new Date(Date.now() + HOUR) }),
        ),
      () =>
        db.withUser(u1, (tx) =>
          tx.update(sessions).set({ ipAddress: '1.1.1.1' }).where(eq(sessions.userId, u1)),
        ),
      () => db.withUser(u1, (tx) => tx.delete(sessions).where(eq(sessions.userId, u1))),
      () =>
        db.withUser(u1, (tx) =>
          tx.insert(users).values({ id, email: `${id}@example.test`, name: 'x' }),
        ),
      () => db.withUser(u1, (tx) => tx.delete(users).where(eq(users.id, u1))),
    ];
    for (const attempt of attempts) {
      expect(await expectRejectCode(attempt())).toBe(RLS_OR_PRIVILEGE_DENIED);
    }
    // Không có gì bị đổi: băm mật khẩu và phiên của u1 còn nguyên.
    const { rows } = await admin.query(
      'SELECT (SELECT count(*)::int FROM core.sessions WHERE user_id = $1) AS s, (SELECT password FROM core.accounts WHERE user_id = $1) AS p',
      [u1],
    );
    expect(rows[0].s).toBeGreaterThan(0);
    expect(rows[0].p).toBe('hash-gia');
  });
});

describe('withWorkspace(W): không thấy phiên/tài khoản; users chỉ thành viên active', () => {
  it('sessions, accounts 0 dòng; verifications bị từ chối quyền', async () => {
    const r = await db.withWorkspace(ws, async (tx) => ({
      s: await tx.select(safeSession).from(sessions),
      a: await tx.select(safeAccount).from(accounts),
    }));
    expect([r.s.length, r.a.length]).toEqual([0, 0]);
    expect(
      await expectRejectCode(db.withWorkspace(ws, (tx) => tx.select().from(verifications))),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
  });

  it('users: chỉ thành viên active của W (không thấy removed, không thấy người ngoài W)', async () => {
    const rows = await db.withWorkspace(ws, (tx) =>
      tx.select({ id: users.id }).from(users).where(inArray(users.id, seededUsers())),
    );
    expect(rows.map((r) => r.id)).toEqual([u1]);
  });

  it('thành viên chuyển sang suspended cũng biến mất khỏi users của workspace', async () => {
    const u = await seedUser(admin);
    const id = await seedMember(admin, ws, u, 'staff');
    expect(
      (
        await db.withWorkspace(ws, (tx) =>
          tx.select({ id: users.id }).from(users).where(eq(users.id, u)),
        )
      ).length,
    ).toBe(1);
    await admin.query("UPDATE core.members SET status = 'suspended' WHERE id = $1", [id]);
    expect(
      (
        await db.withWorkspace(ws, (tx) =>
          tx.select({ id: users.id }).from(users).where(eq(users.id, u)),
        )
      ).length,
    ).toBe(0);
  });

  it('không ghi được users/sessions/accounts từ ngữ cảnh workspace', async () => {
    const id = randomUUID();
    expect(
      await db.withWorkspace(ws, (tx) =>
        tx.update(users).set({ name: 'x' }).where(eq(users.id, u1)).returning({ id: users.id }),
      ),
    ).toHaveLength(0);
    expect(
      await expectRejectCode(
        db.withWorkspace(ws, (tx) =>
          tx.insert(users).values({ id, email: `${id}@example.test`, name: 'x' }),
        ),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
    expect(
      await expectRejectCode(
        db.withWorkspace(ws, (tx) =>
          tx
            .insert(sessions)
            .values({ userId: u1, token: randomUUID(), expiresAt: new Date(Date.now() + HOUR) }),
        ),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
  });

  it('đặt cả workspace lẫn người dùng (lỗi tầng ứng dụng) vẫn không thấy sessions/accounts', async () => {
    const r = await db.withSystem(async (tx) => {
      await tx.execute(
        sql`select set_config('app.workspace_id', ${ws}, true), set_config('app.user_id', ${u1}, true)`,
      );
      return {
        s: await tx.select(safeSession).from(sessions),
        a: await tx.select(safeAccount).from(accounts),
        u: await tx.select({ id: users.id }).from(users).where(inArray(users.id, seededUsers())),
      };
    });
    expect(r.s).toHaveLength(0);
    expect(r.a).toHaveLength(0);
    expect(r.u.map((x) => x.id)).toEqual([u1]); // chỉ thành viên active của W
  });
});

describe('cf_auth không tạo được tài khoản Admin (policy RESTRICTIVE, migration 0011)', () => {
  it('INSERT users với is_admin = true hoặc admin_role khác null → từ chối; người dùng thường vẫn chèn được', async () => {
    for (const extra of [
      { isAdmin: true },
      { isAdmin: true, adminRole: 'super' },
      { adminRole: 'super' },
    ]) {
      const id = randomUUID();
      expect(
        await expectRejectCode(
          authDb.db.insert(users).values({ id, email: `${id}@example.test`, name: 'x', ...extra }),
        ),
        JSON.stringify(extra),
      ).toBe(RLS_OR_PRIVILEGE_DENIED);
    }
    const ok = randomUUID();
    await authDb.db.insert(users).values({ id: ok, email: `${ok}@example.test`, name: 'thường' });
    expect(await authDb.db.select().from(users).where(eq(users.id, ok))).toHaveLength(1);
  });
});

describe('quyền cột trên users vẫn còn (RLS không thay thế GRANT)', () => {
  it('cf_auth không đổi được is_admin / admin_role (cấp quyền Admin không đi qua adapter)', async () => {
    expect(
      await expectRejectCode(
        authDb.transaction((tx) => tx.update(users).set({ isAdmin: true }).where(eq(users.id, u1))),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
    expect(
      await expectRejectCode(
        authDb.transaction((tx) =>
          tx.update(users).set({ adminRole: 'super' }).where(eq(users.id, u1)),
        ),
      ),
    ).toBe(RLS_OR_PRIVILEGE_DENIED);
  });
});

describe('cf_app không đọc cột nhạy cảm của users (migration 0012, HARDEN-3)', () => {
  const sensitive = [
    ['is_admin', { v: users.isAdmin }],
    ['admin_role', { v: users.adminRole }],
    ['email_verified', { v: users.emailVerified }],
    ['totp_enabled', { v: users.twoFactorEnabled }],
  ] as const;

  it.each(sensitive)(
    'withWorkspace và withUser đều bị từ chối khi đọc %s',
    async (_name, columns) => {
      expect(
        await expectRejectCode(db.withWorkspace(ws, (tx) => tx.select(columns).from(users))),
      ).toBe(RLS_OR_PRIVILEGE_DENIED);
      expect(await expectRejectCode(db.withUser(u1, (tx) => tx.select(columns).from(users)))).toBe(
        RLS_OR_PRIVILEGE_DENIED,
      );
    },
  );

  it('select() toàn cột bị từ chối; 7 cột cho phép vẫn đọc được (danh sách thành viên)', async () => {
    expect(await expectRejectCode(db.withWorkspace(ws, (tx) => tx.select().from(users)))).toBe(
      RLS_OR_PRIVILEGE_DENIED,
    );
    const rows = await db.withWorkspace(ws, (tx) =>
      tx
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
          locale: users.locale,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, u1)),
    );
    expect(rows).toHaveLength(1);
  });
});
