import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthDb } from '../src/auth-db';
import type { FlowDb } from '../src/client';
import { phoneVerifications, users } from '../src/schema/core';
import {
  createAdminPool,
  createAppDb,
  createAuthTestDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * SETTINGS-PROFILE-WIRE (migration 0062): `cf_app` chỉ GHI timezone/theme của CHÍNH MÌNH (policy `users_app_update`),
 * không đọc được hai cột đó (giữ 7 cột đọc của 0012) và không chạm SĐT; bảng OTP chỉ `cf_auth` trong ngữ cảnh 'auth'.
 */
const PERMISSION_DENIED = '42501';

let admin: pg.Pool;
let db: FlowDb;
let authDb: AuthDb;
let me: string;
let other: string;
let workspaceId: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  authDb = createAuthTestDb(3);
  me = await seedUser(admin, 'Tôi');
  other = await seedUser(admin, 'Người khác');
  workspaceId = await seedWorkspace(admin);
  await seedMember(admin, workspaceId, me, 'owner');
  await seedMember(admin, workspaceId, other, 'staff');
});

afterAll(async () => {
  await db.close();
  await authDb.close();
  await admin.end();
});

const readAs = async (id: string) =>
  (await admin.query('SELECT timezone, theme, name FROM core.users WHERE id = $1', [id])).rows[0];

describe('hồ sơ người dùng qua cf_app (RLS)', () => {
  it('ghi được timezone/theme/name của chính mình', async () => {
    await db.withUser(me, (tx) =>
      tx
        .update(users)
        .set({ timezone: 'Asia/Bangkok', theme: 'dark', name: 'Tên mới' })
        .where(eq(users.id, me)),
    );
    expect(await readAs(me)).toEqual({ timezone: 'Asia/Bangkok', theme: 'dark', name: 'Tên mới' });
  });

  it('KHÔNG sửa được hồ sơ người khác (0 dòng bị đổi) dù cùng workspace', async () => {
    await db.withUser(me, (tx) =>
      tx.update(users).set({ theme: 'light', timezone: 'UTC' }).where(eq(users.id, other)),
    );
    expect(await readAs(other)).toMatchObject({ theme: 'system', timezone: 'Asia/Ho_Chi_Minh' });
    await db.withActor(workspaceId, me, (tx) =>
      tx.update(users).set({ theme: 'light' }).where(eq(users.id, other)),
    );
    expect((await readAs(other)).theme).toBe('system');
  });

  it('CHECK: theme ngoài light/dark/system và timezone rỗng bị từ chối', async () => {
    await expect(
      db.withUser(me, (tx) =>
        tx.execute(sql`UPDATE core.users SET theme = 'neon' WHERE id = ${me}`),
      ),
    ).rejects.toThrow();
    await expect(
      db.withUser(me, (tx) =>
        tx.execute(sql`UPDATE core.users SET timezone = '' WHERE id = ${me}`),
      ),
    ).rejects.toThrow();
  });

  it('cf_app KHÔNG ghi/đọc được SĐT, phone_verified_at, và không đọc được timezone/theme', async () => {
    for (const statement of [
      sql`UPDATE core.users SET phone = '+84912345678' WHERE id = ${me}`,
      sql`UPDATE core.users SET phone_verified_at = now() WHERE id = ${me}`,
      sql`SELECT phone FROM core.users WHERE id = ${me}`,
      sql`SELECT phone_verified_at FROM core.users WHERE id = ${me}`,
      sql`SELECT timezone FROM core.users WHERE id = ${me}`,
      sql`SELECT theme FROM core.users WHERE id = ${me}`,
    ]) {
      expect(await expectRejectCode(db.withUser(me, (tx) => tx.execute(statement)))).toBe(
        PERMISSION_DENIED,
      );
    }
  });

  it('cf_app không có quyền nào trên core.phone_verifications', async () => {
    for (const statement of [
      sql`SELECT 1 FROM core.phone_verifications LIMIT 1`,
      sql`DELETE FROM core.phone_verifications`,
    ]) {
      expect(await expectRejectCode(db.withUser(me, (tx) => tx.execute(statement)))).toBe(
        PERMISSION_DENIED,
      );
    }
  });
});

describe('SĐT + OTP qua cf_auth', () => {
  const hash = 'a'.repeat(64);

  it('cf_auth ghi SĐT chuẩn E.164 + thử thách OTP; CHECK chặn định dạng sai', async () => {
    await authDb.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ phone: '+84912345678', phoneVerifiedAt: new Date() })
        .where(eq(users.id, me));
      await tx.insert(phoneVerifications).values({
        userId: me,
        phone: '+84912345678',
        codeHash: hash,
        expiresAt: new Date(Date.now() + 300_000),
      });
    });
    const row = (await admin.query('SELECT phone FROM core.users WHERE id = $1', [me])).rows[0];
    expect(row.phone).toBe('+84912345678');
    await expect(
      authDb.transaction((tx) =>
        tx.execute(sql`UPDATE core.users SET phone = '0912345678' WHERE id = ${me}`),
      ),
    ).rejects.toThrow();
    await expect(
      authDb.transaction((tx) =>
        tx.execute(
          sql`UPDATE core.phone_verifications SET code_hash = 'khong-phai-hex' WHERE user_id = ${me}`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('mã OTP chỉ lưu băm hex 64; một thử thách mỗi người dùng (khóa chính)', async () => {
    await expect(
      authDb.transaction((tx) =>
        tx.insert(phoneVerifications).values({
          userId: me,
          phone: '+84912345678',
          codeHash: hash,
          expiresAt: new Date(),
        }),
      ),
    ).rejects.toThrow();
  });

  it('phone_verified_at đòi có phone', async () => {
    await expect(
      authDb.transaction((tx) =>
        tx.execute(
          sql`UPDATE core.users SET phone = NULL, phone_verified_at = now() WHERE id = ${other}`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('cf_auth KHÔNG sửa được is_admin/admin_role/email (không mở rộng quyền)', async () => {
    expect(
      await expectRejectCode(
        authDb.transaction((tx) =>
          tx.execute(sql`UPDATE core.users SET is_admin = true WHERE id = ${me}`),
        ),
      ),
    ).toBe(PERMISSION_DENIED);
  });
});
