import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { accounts, sessions, users, verifications } from '../src/schema/core';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

const RLS_VIOLATION = '42501';
const HOUR = 3600 * 1000;

let admin: pg.Pool;
let db: FlowDb;
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
  await admin.end();
});

const mine = [() => u1, () => u2, () => u3];
const seededUsers = () => mine.map((f) => f());

describe('KHÔNG có ngữ cảnh → không thấy dòng nào (âm tính)', () => {
  it('db.system và withSystem đọc users/sessions/accounts/verifications đều 0 dòng', async () => {
    expect(await db.system.select().from(users)).toHaveLength(0);
    expect(await db.system.select().from(sessions)).toHaveLength(0);
    expect(await db.system.select().from(accounts)).toHaveLength(0);
    expect(await db.system.select().from(verifications)).toHaveLength(0);
    const viaSystem = await db.withSystem(async (tx) => ({
      u: await tx.select().from(users),
      s: await tx.select().from(sessions),
      a: await tx.select().from(accounts),
      v: await tx.select().from(verifications),
    }));
    expect([
      viaSystem.u.length,
      viaSystem.s.length,
      viaSystem.a.length,
      viaSystem.v.length,
    ]).toEqual([0, 0, 0, 0]);
  });

  it('không ngữ cảnh không ghi được vào bốn bảng (vi phạm RLS)', async () => {
    const id = randomUUID();
    expect(
      await expectRejectCode(
        db.system.insert(users).values({ id, email: `${id}@example.test`, name: 'x' }),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.system
          .insert(sessions)
          .values({ userId: u1, token: randomUUID(), expiresAt: new Date(Date.now() + HOUR) }),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.system.insert(accounts).values({ userId: u1, providerId: 'x', accountId: randomUUID() }),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.system
          .insert(verifications)
          .values({ identifier: 'x', value: 'y', expiresAt: new Date(Date.now() + HOUR) }),
      ),
    ).toBe(RLS_VIOLATION);
  });

  it('không sửa/xóa được dòng nào (0 dòng bị ảnh hưởng)', async () => {
    expect(
      await db.system.update(users).set({ name: 'đổi' }).where(eq(users.id, u1)).returning(),
    ).toHaveLength(0);
    expect(
      await db.system.delete(sessions).where(eq(sessions.userId, u1)).returning(),
    ).toHaveLength(0);
  });

  it('ngữ cảnh auth không rò sang lần dùng lại kết nối (pool 1 kết nối)', async () => {
    expect(
      (
        await db.withAuthContext((tx) =>
          tx.select().from(sessions).where(inArray(sessions.userId, seededUsers())),
        )
      ).length,
    ).toBe(3);
    // Cùng kết nối, giao dịch mới, không ngữ cảnh → lại 0 dòng.
    expect(await db.withSystem((tx) => tx.select().from(sessions))).toHaveLength(0);
    const setting = await db.withSystem((tx) =>
      tx.execute(sql`select current_setting('app.ctx', true) as ctx`),
    );
    expect([null, '']).toContain(setting.rows[0]?.ctx);
  });
});

describe('ngữ cảnh auth (withAuthContext và db.auth) thấy và ghi được tất cả', () => {
  it('withAuthContext thấy đủ bốn bảng', async () => {
    const all = await db.withAuthContext(async (tx) => ({
      u: await tx.select().from(users).where(inArray(users.id, seededUsers())),
      s: await tx.select().from(sessions).where(inArray(sessions.userId, seededUsers())),
      a: await tx.select().from(accounts).where(inArray(accounts.userId, seededUsers())),
      v: await tx.select().from(verifications).where(inArray(verifications.id, verificationIds)),
    }));
    expect([all.u.length, all.s.length, all.a.length, all.v.length]).toEqual([3, 3, 3, 2]);
  });

  it('db.auth (pool riêng cho adapter Better Auth) cũng thấy tất cả và ghi được', async () => {
    const rows = await db.auth
      .select()
      .from(sessions)
      .where(inArray(sessions.userId, seededUsers()));
    expect(rows).toHaveLength(3);
    const id = randomUUID();
    await db.auth.insert(users).values({ id, email: `${id}@example.test`, name: 'Qua adapter' });
    expect(await db.auth.select().from(users).where(eq(users.id, id))).toHaveLength(1);
  });

  it('db.auth và db.system là hai pool khác nhau: system vẫn không thấy gì', async () => {
    expect(await db.system.select().from(sessions)).toHaveLength(0);
  });
});

describe('withUser(u): chỉ dòng của mình', () => {
  it('thấy đúng dòng của mình ở users/sessions/accounts; verifications không thấy', async () => {
    const r = await db.withUser(u1, async (tx) => ({
      u: await tx.select({ id: users.id }).from(users),
      s: await tx.select({ userId: sessions.userId }).from(sessions),
      a: await tx.select({ userId: accounts.userId }).from(accounts),
      v: await tx.select().from(verifications),
    }));
    expect(r.u.map((x) => x.id)).toEqual([u1]);
    expect(r.s.every((x) => x.userId === u1)).toBe(true);
    expect(r.s.length).toBeGreaterThan(0);
    expect(r.a.every((x) => x.userId === u1)).toBe(true);
    expect(r.a.length).toBeGreaterThan(0);
    expect(r.v).toHaveLength(0);
  });

  it('sửa được dòng của mình nhưng không sửa/xóa được dòng của người khác', async () => {
    expect(
      await db.withUser(u1, (tx) =>
        tx.update(users).set({ name: 'Tên mới' }).where(eq(users.id, u1)).returning(),
      ),
    ).toHaveLength(1);
    expect(
      await db.withUser(u1, (tx) =>
        tx.update(users).set({ name: 'Hack' }).where(eq(users.id, u3)).returning(),
      ),
    ).toHaveLength(0);
    expect(
      await db.withUser(u1, (tx) => tx.delete(sessions).where(eq(sessions.userId, u3)).returning()),
    ).toHaveLength(0);
  });

  it('thu hồi được phiên của chính mình (xóa dòng của mình)', async () => {
    const u = await seedUser(admin);
    await seedSession(u);
    expect(
      await db.withUser(u, (tx) => tx.delete(sessions).where(eq(sessions.userId, u)).returning()),
    ).toHaveLength(1);
  });

  it('không chèn được người dùng/phiên cho người khác (WITH CHECK)', async () => {
    const id = randomUUID();
    expect(
      await expectRejectCode(
        db.withUser(u1, (tx) =>
          tx.insert(users).values({ id, email: `${id}@example.test`, name: 'x' }),
        ),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.withUser(u1, (tx) =>
          tx
            .insert(sessions)
            .values({ userId: u3, token: randomUUID(), expiresAt: new Date(Date.now() + HOUR) }),
        ),
      ),
    ).toBe(RLS_VIOLATION);
  });
});

describe('withWorkspace(W): không thấy phiên/tài khoản; users chỉ thành viên active', () => {
  it('sessions, accounts, verifications đều 0 dòng', async () => {
    const r = await db.withWorkspace(ws, async (tx) => ({
      s: await tx.select().from(sessions),
      a: await tx.select().from(accounts),
      v: await tx.select().from(verifications),
    }));
    expect([r.s.length, r.a.length, r.v.length]).toEqual([0, 0, 0]);
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
        tx.update(users).set({ name: 'x' }).where(eq(users.id, u1)).returning(),
      ),
    ).toHaveLength(0);
    expect(
      await expectRejectCode(
        db.withWorkspace(ws, (tx) =>
          tx.insert(users).values({ id, email: `${id}@example.test`, name: 'x' }),
        ),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.withWorkspace(ws, (tx) =>
          tx
            .insert(sessions)
            .values({ userId: u1, token: randomUUID(), expiresAt: new Date(Date.now() + HOUR) }),
        ),
      ),
    ).toBe(RLS_VIOLATION);
  });

  it('đặt cả workspace lẫn người dùng (lỗi tầng ứng dụng) vẫn không thấy sessions/accounts', async () => {
    const r = await db.withSystem(async (tx) => {
      await tx.execute(
        sql`select set_config('app.workspace_id', ${ws}, true), set_config('app.user_id', ${u1}, true)`,
      );
      return {
        s: await tx.select().from(sessions),
        a: await tx.select().from(accounts),
        u: await tx.select({ id: users.id }).from(users).where(inArray(users.id, seededUsers())),
      };
    });
    expect(r.s).toHaveLength(0);
    expect(r.a).toHaveLength(0);
    expect(r.u.map((x) => x.id)).toEqual([u1]); // chỉ thành viên active của W
  });
});

describe('quyền cột trên users vẫn còn (RLS không thay thế GRANT)', () => {
  it('trong ngữ cảnh auth vẫn không đổi được is_admin / admin_role', async () => {
    expect(
      await expectRejectCode(
        db.withAuthContext((tx) => tx.update(users).set({ isAdmin: true }).where(eq(users.id, u1))),
      ),
    ).toBe(RLS_VIOLATION);
  });
});
