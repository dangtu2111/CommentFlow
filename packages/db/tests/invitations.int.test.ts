import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  createAuthTestDb,
  expectRejectCode,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

let admin: pg.Pool;
let db: FlowDb;

beforeAll(() => {
  admin = createAdminPool();
  db = createAppDb();
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const PERMISSION_DENIED = '42501';
const RLS_VIOLATION = '42501';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

async function verifiedUser(email?: string): Promise<{ id: string; email: string }> {
  const id = await seedUser(admin);
  const address = email ?? `${id}@example.test`;
  await admin.query('UPDATE core.users SET email = $2, email_verified = true WHERE id = $1', [
    id,
    address,
  ]);
  return { id, email: address };
}

async function seedInvitation(
  workspaceId: string,
  email: string,
  options: { role?: string; invitedBy?: string; expires?: string } = {},
): Promise<{ id: string; token: string }> {
  const token = newToken();
  const row = await admin.query(
    `INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
     VALUES ($1, $2, $3, $4, now() + $5::interval, $6) RETURNING id`,
    [
      workspaceId,
      email,
      options.role ?? 'staff',
      hashOf(token),
      options.expires ?? '7 days',
      options.invitedBy ?? null,
    ],
  );
  return { id: row.rows[0].id as string, token };
}

type AcceptRow = {
  accepted_workspace_id: string;
  accepted_role: string;
  previous_role: string | null;
  inviter_id: string | null;
};
const accept = (userId: string, token: string) =>
  db.withUser(userId, async (tx) => {
    const result = await tx.execute<AcceptRow>(
      sql`SELECT * FROM core.accept_invitation(${hashOf(token)})`,
    );
    return result.rows;
  });

describe('hàm nhận lời mời: cấu hình bảo mật', () => {
  it('SECURITY DEFINER, search_path cố định, không cho PUBLIC; chỉ cf_app được EXECUTE (cf_auth thì không)', async () => {
    const { rows } = await admin.query(
      `SELECT p.proname, p.prosecdef, p.proconfig, p.proacl::text AS acl,
              has_function_privilege('cf_app', p.oid, 'EXECUTE') AS app_ok,
              has_function_privilege('cf_auth', p.oid, 'EXECUTE') AS auth_ok,
              pg_get_userbyid(p.proowner) AS owner,
              pg_get_function_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'core' AND p.proname IN ('accept_invitation', 'invitation_preview', 'guard_last_owner')
       ORDER BY p.proname`,
    );
    expect(rows.map((r) => r.proname)).toEqual([
      'accept_invitation',
      'guard_last_owner',
      'invitation_preview',
    ]);
    for (const row of rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig).toContain('search_path=pg_catalog, core, pg_temp');
      expect(row.acl).not.toMatch(/(^|[{,])=X/); // không có quyền cho PUBLIC
      expect(row.auth_ok).toBe(false);
    }
    const byName = Object.fromEntries(rows.map((r) => [r.proname, r]));
    expect(byName.accept_invitation.app_ok).toBe(true);
    expect(byName.invitation_preview.app_ok).toBe(true);
    // accept_invitation chỉ nhận MỘT tham số (băm token): không nhận email hay user id từ người gọi
    expect(byName.accept_invitation.args).toBe('p_token_hash text');
  });

  it('cf_auth không gọi được hàm (permission denied)', async () => {
    const authDb = createAuthTestDb(1);
    try {
      const code = await expectRejectCode(
        authDb.transaction((tx) =>
          tx.execute(sql`SELECT * FROM core.accept_invitation(${hashOf(newToken())})`),
        ),
      );
      expect(code).toBe(PERMISSION_DENIED);
    } finally {
      await authDb.close();
    }
  });
});

describe('hàm nhận lời mời: hành vi', () => {
  it('không có app.user_id hoặc có app.workspace_id → không có dòng nào, dù token và email đúng', async () => {
    const ws = await seedWorkspace(admin);
    const user = await verifiedUser();
    const { token } = await seedInvitation(ws, user.email);
    // Không ngữ cảnh người dùng
    const none = await db.withSystem((tx) =>
      tx.execute(sql`SELECT * FROM core.accept_invitation(${hashOf(token)})`),
    );
    expect(none.rows).toHaveLength(0);
    // Có ngữ cảnh workspace (không phải withUser)
    const inWorkspace = await db.withWorkspace(ws, (tx) =>
      tx.execute(sql`SELECT * FROM core.accept_invitation(${hashOf(token)})`),
    );
    expect(inWorkspace.rows).toHaveLength(0);
    // Lời mời chưa bị dùng
    const rows = await admin.query(
      'SELECT accepted_at FROM core.invitations WHERE token_hash = $1',
      [hashOf(token)],
    );
    expect(rows.rows[0].accepted_at).toBeNull();
  });

  it('đúng người → thêm thành viên, đánh dấu đã dùng, trả vai trò + người mời; lần hai không có dòng', async () => {
    const ws = await seedWorkspace(admin);
    const inviter = await seedUser(admin);
    await seedMember(admin, ws, inviter, 'owner');
    const user = await verifiedUser(`Mixed.Case.${newId()}@Example.Test`);
    const { token } = await seedInvitation(ws, user.email.toLowerCase(), {
      role: 'staff',
      invitedBy: inviter,
    });
    const rows = await accept(user.id, token);
    expect(rows).toEqual([
      {
        accepted_workspace_id: ws,
        accepted_role: 'staff',
        previous_role: null,
        inviter_id: inviter,
      },
    ]);
    const member = await admin.query(
      'SELECT role, status, invited_by FROM core.members WHERE workspace_id = $1 AND user_id = $2',
      [ws, user.id],
    );
    expect(member.rows[0]).toEqual({ role: 'staff', status: 'active', invited_by: inviter });
    expect(await accept(user.id, token)).toHaveLength(0);
    const log = await admin.query(
      "SELECT action, actor_id FROM core.action_logs WHERE workspace_id = $1 AND action = 'invitation.accepted'",
      [ws],
    );
    expect(log.rows).toEqual([{ action: 'invitation.accepted', actor_id: user.id }]);
  });

  it('mọi ca không hợp lệ cho cùng kết quả (0 dòng) và không thay đổi dữ liệu', async () => {
    const ws = await seedWorkspace(admin);
    const right = await verifiedUser();
    const other = await verifiedUser();
    const unverified = await seedUser(admin);
    await admin.query('UPDATE core.users SET email = $2 WHERE id = $1', [
      unverified,
      `${unverified}@example.test`,
    ]);
    const good = await seedInvitation(ws, right.email);
    const expiredUser = await verifiedUser();
    const expired = await seedInvitation(ws, expiredUser.email, { expires: '-1 minute' });
    const revokedUser = await verifiedUser();
    const revoked = await seedInvitation(ws, revokedUser.email);
    await admin.query('UPDATE core.invitations SET revoked_at = now() WHERE id = $1', [revoked.id]);
    const forUnverified = await seedInvitation(ws, `${unverified}@example.test`);
    const suspendedUser = await verifiedUser();
    await seedMember(admin, ws, suspendedUser.id, 'staff');
    await admin.query("UPDATE core.members SET status = 'suspended' WHERE user_id = $1", [
      suspendedUser.id,
    ]);
    const forSuspended = await seedInvitation(ws, suspendedUser.email);

    const results = [
      await accept(other.id, good.token), // sai email
      await accept(right.id, newToken()), // sai token
      await accept(expiredUser.id, expired.token), // hết hạn (đúng email, đã xác minh)
      await accept(revokedUser.id, revoked.token), // đã thu hồi (đúng email, đã xác minh)
      await accept(unverified, forUnverified.token), // email chưa xác minh
      await accept(suspendedUser.id, forSuspended.token), // thành viên bị tạm khóa
      await accept(newId(), good.token), // user không tồn tại
    ];
    for (const r of results) expect(r).toEqual([]);
    const memberCount = await admin.query(
      'SELECT count(*)::int AS n FROM core.members WHERE workspace_id = $1',
      [ws],
    );
    expect(memberCount.rows[0].n).toBe(1); // chỉ người bị tạm khóa đã có từ trước
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM core.invitations WHERE workspace_id = $1 AND accepted_at IS NOT NULL',
          [ws],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('thành viên đã gỡ nhận lời mời → active lại với vai trò mới; thành viên active được áp vai trò mới và báo vai trò cũ', async () => {
    const ws = await seedWorkspace(admin);
    const boss = await seedUser(admin);
    await seedMember(admin, ws, boss, 'owner');
    const removed = await verifiedUser();
    await seedMember(admin, ws, removed.id, 'owner');
    await admin.query("UPDATE core.members SET status = 'removed' WHERE user_id = $1", [
      removed.id,
    ]);
    const a = await seedInvitation(ws, removed.email, { role: 'staff' });
    expect(await accept(removed.id, a.token)).toMatchObject([
      { accepted_role: 'staff', previous_role: null },
    ]);
    const active = await verifiedUser();
    await seedMember(admin, ws, active.id, 'staff');
    const b = await seedInvitation(ws, active.email, { role: 'owner' });
    expect(await accept(active.id, b.token)).toMatchObject([
      { accepted_role: 'owner', previous_role: 'staff' },
    ]);
  });

  it('xem trước: chỉ tên workspace + vai trò (không có email); không hợp lệ → 0 dòng', async () => {
    const ws = await seedWorkspace(admin);
    const { token } = await seedInvitation(ws, 'an@example.test', { role: 'owner' });
    const preview = await db.withSystem((tx) =>
      tx.execute(sql`SELECT * FROM core.invitation_preview(${hashOf(token)})`),
    );
    expect(preview.rows).toHaveLength(1);
    expect(Object.keys(preview.rows[0] ?? {}).sort()).toEqual(['role', 'workspace_name']);
    const none = await db.withSystem((tx) =>
      tx.execute(sql`SELECT * FROM core.invitation_preview(${hashOf(newToken())})`),
    );
    expect(none.rows).toHaveLength(0);
  });
});

describe('quyền của cf_app trên invitations', () => {
  it('chỉ thu hồi được (revoked_at): không sửa token/email/vai trò/hạn/đã-dùng, không xóa, không tạo sẵn lời mời đã dùng', async () => {
    const ws = await seedWorkspace(admin);
    const { id } = await seedInvitation(ws, 'x@example.test');
    const run = (text: string) =>
      expectRejectCode(db.withWorkspace(ws, (tx) => tx.execute(sql.raw(text))));
    expect(await run(`UPDATE core.invitations SET token_hash = 'a' WHERE id = '${id}'`)).toBe(
      PERMISSION_DENIED,
    );
    expect(await run(`UPDATE core.invitations SET accepted_at = now() WHERE id = '${id}'`)).toBe(
      PERMISSION_DENIED,
    );
    expect(await run(`UPDATE core.invitations SET role = 'owner' WHERE id = '${id}'`)).toBe(
      PERMISSION_DENIED,
    );
    expect(
      await run(
        `UPDATE core.invitations SET expires_at = now() + interval '1 year' WHERE id = '${id}'`,
      ),
    ).toBe(PERMISSION_DENIED);
    expect(await run(`DELETE FROM core.invitations WHERE id = '${id}'`)).toBe(PERMISSION_DENIED);
    expect(
      await run(`UPDATE core.invitations SET revoked_at = now() WHERE id = '${id}'`),
    ).toBeUndefined();
    const code = await expectRejectCode(
      db.withWorkspace(ws, (tx) =>
        tx.execute(sql`INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at, accepted_at)
          VALUES (${ws}, 'y@example.test', 'staff', ${hashOf(newToken())}, now() + interval '1 day', now())`),
      ),
    );
    expect(code).toBe(RLS_VIOLATION);
  });

  it('mỗi (workspace, email) chỉ một lời mời đang chờ (không phân biệt hoa/thường); thu hồi rồi mời lại được', async () => {
    const ws = await seedWorkspace(admin);
    const first = await seedInvitation(ws, 'Duplicate@Example.Test');
    await expect(seedInvitation(ws, 'duplicate@example.test')).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
    await admin.query('UPDATE core.invitations SET revoked_at = now() WHERE id = $1', [first.id]);
    await expect(seedInvitation(ws, 'duplicate@example.test')).resolves.toBeTruthy();
    // Workspace khác không bị ảnh hưởng
    const other = await seedWorkspace(admin);
    await expect(seedInvitation(other, 'duplicate@example.test')).resolves.toBeTruthy();
  });
});

describe('trigger giữ Owner cuối cùng', () => {
  it('hạ/khóa/gỡ/xóa Owner active cuối cùng bị chặn (cả bằng chủ sở hữu); có Owner thứ hai thì được', async () => {
    const ws = await seedWorkspace(admin);
    const a = await seedUser(admin);
    const b = await seedUser(admin);
    const memberA = await seedMember(admin, ws, a, 'owner');
    const memberB = await seedMember(admin, ws, b, 'owner');
    await expect(
      admin.query("UPDATE core.members SET role = 'staff' WHERE id = $1", [memberA]),
    ).resolves.toBeTruthy(); // còn B
    for (const text of [
      "UPDATE core.members SET role = 'staff' WHERE id = $1",
      "UPDATE core.members SET status = 'suspended' WHERE id = $1",
      "UPDATE core.members SET status = 'removed' WHERE id = $1",
      'DELETE FROM core.members WHERE id = $1',
    ]) {
      await expect(admin.query(text, [memberB])).rejects.toMatchObject({ code: CHECK_VIOLATION });
    }
    // Owner đã bị hạ (staff) không còn được tính; B vẫn là Owner cuối.
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM core.members WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'",
          [ws],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('xóa cứng cả workspace (cascade) không bị trigger chặn', async () => {
    const ws = await seedWorkspace(admin);
    const a = await seedUser(admin);
    await seedMember(admin, ws, a, 'owner');
    await expect(
      admin.query('DELETE FROM core.workspaces WHERE id = $1', [ws]),
    ).resolves.toBeTruthy();
  });
});

describe('sau kiểm chứng độc lập: các siết bổ sung của 0015', () => {
  it('thu hồi là một chiều: cf_app không bỏ thu hồi (revoked_at = NULL) và không thu hồi lời mời đã dùng', async () => {
    const ws = await seedWorkspace(admin);
    const { id } = await seedInvitation(ws, 'revoke@example.test');
    const revoke = () =>
      db.withWorkspace(ws, (tx) =>
        tx.execute(
          sql`UPDATE core.invitations SET revoked_at = now() WHERE id = ${id} RETURNING id`,
        ),
      );
    expect((await revoke()).rows).toHaveLength(1);
    // đã thu hồi: không đặt lại NULL (USING chặn dòng đã thu hồi → 0 dòng bị sửa)
    const reset = await db.withWorkspace(ws, (tx) =>
      tx.execute(sql`UPDATE core.invitations SET revoked_at = NULL WHERE id = ${id} RETURNING id`),
    );
    expect(reset.rows).toHaveLength(0);
    // lời mời đã dùng: không thu hồi được
    const used = await seedInvitation(ws, 'used@example.test');
    await admin.query('UPDATE core.invitations SET accepted_at = now() WHERE id = $1', [used.id]);
    const again = await db.withWorkspace(ws, (tx) =>
      tx.execute(
        sql`UPDATE core.invitations SET revoked_at = now() WHERE id = ${used.id} RETURNING id`,
      ),
    );
    expect(again.rows).toHaveLength(0);
    const row = await admin.query('SELECT revoked_at FROM core.invitations WHERE id = $1', [id]);
    expect(row.rows[0].revoked_at).not.toBeNull();
  });

  it('lời mời của workspace đã xóa mềm không nhận được (giống xem trước)', async () => {
    const ws = await seedWorkspace(admin);
    const user = await verifiedUser();
    const { token } = await seedInvitation(ws, user.email);
    await admin.query("UPDATE core.workspaces SET status = 'deleted' WHERE id = $1", [ws]);
    expect(await accept(user.id, token)).toEqual([]);
    expect(
      (
        await db.withSystem((tx) =>
          tx.execute(sql`SELECT * FROM core.invitation_preview(${hashOf(token)})`),
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('Owner đang hoạt động nhận lời mời vai trò Staff: KHÔNG bị hạ (không lỗi trigger), lời mời vẫn được đánh dấu đã dùng', async () => {
    const ws = await seedWorkspace(admin);
    const owner = await verifiedUser();
    await seedMember(admin, ws, owner.id, 'owner'); // Owner duy nhất
    const { token, id } = await seedInvitation(ws, owner.email, { role: 'staff' });
    expect(await accept(owner.id, token)).toMatchObject([
      { accepted_role: 'owner', previous_role: 'owner' },
    ]);
    const member = await admin.query(
      'SELECT role, status FROM core.members WHERE workspace_id = $1 AND user_id = $2',
      [ws, owner.id],
    );
    expect(member.rows[0]).toEqual({ role: 'owner', status: 'active' });
    const inv = await admin.query('SELECT accepted_at FROM core.invitations WHERE id = $1', [id]);
    expect(inv.rows[0].accepted_at).not.toBeNull();
  });

  it('nhận lời mời không xóa người mời cũ của thành viên đã có', async () => {
    const ws = await seedWorkspace(admin);
    const boss = await seedUser(admin);
    await seedMember(admin, ws, boss, 'owner');
    const user = await verifiedUser();
    await seedMember(admin, ws, user.id, 'staff');
    await admin.query('UPDATE core.members SET invited_by = $1 WHERE user_id = $2', [
      boss,
      user.id,
    ]);
    const { token } = await seedInvitation(ws, user.email, { role: 'owner' }); // không có invited_by
    await accept(user.id, token);
    const row = await admin.query('SELECT invited_by FROM core.members WHERE user_id = $1', [
      user.id,
    ]);
    expect(row.rows[0].invited_by).toBe(boss);
  });
});
