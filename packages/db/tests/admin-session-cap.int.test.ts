import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { sessions } from '../src/schema/core';
import { createAdminPool, createAppDb, expectRejectCode, seedUser } from './helpers';

const HOUR = 3600 * 1000;
const PERMISSION_DENIED = '42501';

let admin: pg.Pool;
let db: FlowDb;
let userId: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  userId = await seedUser(admin);
  // Phiên Admin chỉ tạo được cho người dùng có is_admin = true (0009).
  await admin.query("UPDATE core.users SET is_admin = true, admin_role = 'super' WHERE id = $1", [
    userId,
  ]);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

type Row = { id: string; created_at: Date; expires_at: Date; is_admin_session: boolean };

async function insertAsOwner(opts: { isAdmin: boolean; expiresInHours: number; createdAt?: Date }) {
  const { rows } = await admin.query<Row>(
    `INSERT INTO core.sessions (user_id, token, expires_at, is_admin_session, created_at)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, COALESCE($5, now()))
     RETURNING id, created_at, expires_at, is_admin_session`,
    [userId, randomUUID(), opts.expiresInHours, opts.isAdmin, opts.createdAt ?? null],
  );
  return rows[0] as Row;
}

const fetchRow = async (id: string) =>
  (
    await admin.query<Row>(
      'SELECT id, created_at, expires_at, is_admin_session FROM core.sessions WHERE id = $1',
      [id],
    )
  ).rows[0] as Row;

describe('trigger hạn phiên Admin (INSERT và UPDATE)', () => {
  it('INSERT phiên Admin với hạn 14 ngày → lưu đúng created_at + 8 giờ', async () => {
    const row = await insertAsOwner({ isAdmin: true, expiresInHours: 14 * 24 });
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(8 * HOUR);
  });

  it('UPDATE kéo hạn phiên Admin vượt 8 giờ (như Better Auth làm mới thành +14 ngày) → bị cắt lại', async () => {
    const row = await insertAsOwner({ isAdmin: true, expiresInHours: 1 });
    await admin.query(
      "UPDATE core.sessions SET expires_at = now() + interval '14 days' WHERE id = $1",
      [row.id],
    );
    const after = await fetchRow(row.id);
    expect(after.expires_at.getTime()).toBe(after.created_at.getTime() + 8 * HOUR);
  });

  it('hạn ngắn hơn 8 giờ được giữ nguyên (chỉ cắt, không kéo dài)', async () => {
    const row = await insertAsOwner({ isAdmin: true, expiresInHours: 2 });
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBeLessThan(8 * HOUR);
    const after = await fetchRow(row.id);
    expect(after.expires_at.getTime()).toBe(row.expires_at.getTime());
  });

  it('phiên app (không Admin) giữ hạn 14 ngày', async () => {
    const row = await insertAsOwner({ isAdmin: false, expiresInHours: 14 * 24 });
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(14 * 24 * HOUR);
  });

  it('created_at chỉ được lùi: dời muộn bị bỏ qua (không lách hạn 8 giờ bằng cách đổi created_at)', async () => {
    const row = await insertAsOwner({ isAdmin: true, expiresInHours: 8 });
    await admin.query(
      "UPDATE core.sessions SET created_at = now() + interval '5 hours' WHERE id = $1",
      [row.id],
    );
    expect((await fetchRow(row.id)).created_at.getTime()).toBe(row.created_at.getTime());

    // Lùi created_at → hạn bị cắt theo mốc mới.
    await admin.query(
      "UPDATE core.sessions SET created_at = created_at - interval '6 hours' WHERE id = $1",
      [row.id],
    );
    const after = await fetchRow(row.id);
    expect(after.created_at.getTime()).toBe(row.created_at.getTime() - 6 * HOUR);
    expect(after.expires_at.getTime()).toBeLessThanOrEqual(after.created_at.getTime() + 8 * HOUR);
  });
});

describe('quyền cột của cf_app trên core.sessions', () => {
  it('KHÔNG đổi được is_admin_session (cả nâng lên lẫn hạ xuống) → từ chối quyền', async () => {
    const normal = await insertAsOwner({ isAdmin: false, expiresInHours: 24 });
    const privileged = await insertAsOwner({ isAdmin: true, expiresInHours: 4 });
    expect(
      await expectRejectCode(
        db.withAuthContext((tx) =>
          tx.update(sessions).set({ isAdminSession: true }).where(eq(sessions.id, normal.id)),
        ),
      ),
    ).toBe(PERMISSION_DENIED);
    expect(
      await expectRejectCode(
        db.withAuthContext((tx) =>
          tx.update(sessions).set({ isAdminSession: false }).where(eq(sessions.id, privileged.id)),
        ),
      ),
    ).toBe(PERMISSION_DENIED);
    expect((await fetchRow(normal.id)).is_admin_session).toBe(false);
    expect((await fetchRow(privileged.id)).is_admin_session).toBe(true);
  });

  it('KHÔNG đổi được created_at, user_id, token → từ chối quyền', async () => {
    const row = await insertAsOwner({ isAdmin: false, expiresInHours: 24 });
    for (const change of [
      { createdAt: new Date(Date.now() - HOUR) },
      { userId: randomUUID() },
      { token: randomUUID() },
    ]) {
      expect(
        await expectRejectCode(
          db.withAuthContext((tx) =>
            tx.update(sessions).set(change).where(eq(sessions.id, row.id)),
          ),
        ),
      ).toBe(PERMISSION_DENIED);
    }
  });

  it('vẫn đổi được expires_at, updated_at, ip, user_agent (việc Better Auth cần); phiên Admin vẫn bị cắt hạn', async () => {
    const row = await insertAsOwner({ isAdmin: true, expiresInHours: 1 });
    await db.withAuthContext((tx) =>
      tx
        .update(sessions)
        .set({
          expiresAt: new Date(Date.now() + 14 * 24 * HOUR),
          updatedAt: new Date(),
          ipAddress: '10.0.0.1',
          userAgent: 'thu',
        })
        .where(eq(sessions.id, row.id)),
    );
    const after = await fetchRow(row.id);
    expect(after.expires_at.getTime()).toBe(after.created_at.getTime() + 8 * HOUR);
  });

  it('cf_app chèn được phiên Admin qua đường xác thực (tạo phiên Admin) và hạn bị cắt 8 giờ', async () => {
    const created = await db.withAuthContext((tx) =>
      tx
        .insert(sessions)
        .values({
          userId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 14 * 24 * HOUR),
          isAdminSession: true,
        })
        .returning({ id: sessions.id }),
    );
    const after = await fetchRow(created[0]?.id as string);
    expect(after.expires_at.getTime()).toBe(after.created_at.getTime() + 8 * HOUR);
  });
});

describe('đường INSERT của trigger (kiểm chứng lần ba)', () => {
  it('cf_app KHÔNG chèn được phiên Admin với created_at ở tương lai để kéo dài hạn', async () => {
    const created = await db.withAuthContext((tx) =>
      tx
        .insert(sessions)
        .values({
          userId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 400 * 24 * HOUR),
          createdAt: new Date(Date.now() + 365 * 24 * HOUR),
          isAdminSession: true,
        })
        .returning({ id: sessions.id }),
    );
    const row = await fetchRow(created[0]?.id as string);
    expect(row.created_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(row.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 8 * HOUR + 1000);
  });

  it('phiên Admin chỉ được TẠO cho người dùng is_admin = true (cả chủ sở hữu lẫn cf_app) → từ chối', async () => {
    const normalUser = await seedUser(admin);
    expect(
      await expectRejectCode(
        admin.query(
          "INSERT INTO core.sessions (user_id, token, expires_at, is_admin_session) VALUES ($1, $2, now() + interval '1 hour', true)",
          [normalUser, randomUUID()],
        ),
      ),
    ).toBe(PERMISSION_DENIED);
    expect(
      await expectRejectCode(
        db.withAuthContext((tx) =>
          tx.insert(sessions).values({
            userId: normalUser,
            token: randomUUID(),
            expiresAt: new Date(Date.now() + HOUR),
            isAdminSession: true,
          }),
        ),
      ),
    ).toBe(PERMISSION_DENIED);
  });

  it('không bật được cờ Admin bằng UPDATE cho người dùng không phải Admin; với Admin thì được', async () => {
    const normalUser = await seedUser(admin);
    const normal = await admin.query(
      "INSERT INTO core.sessions (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 day') RETURNING id",
      [normalUser, randomUUID()],
    );
    expect(
      await expectRejectCode(
        admin.query('UPDATE core.sessions SET is_admin_session = true WHERE id = $1', [
          normal.rows[0].id,
        ]),
      ),
    ).toBe(PERMISSION_DENIED);

    const row = await insertAsOwner({ isAdmin: false, expiresInHours: 24 });
    await admin.query('UPDATE core.sessions SET is_admin_session = true WHERE id = $1', [row.id]);
    const after = await fetchRow(row.id);
    expect(after.is_admin_session).toBe(true);
    expect(after.expires_at.getTime()).toBeLessThanOrEqual(after.created_at.getTime() + 8 * HOUR);
  });
});
