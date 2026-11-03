import { and, eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { aiUsage } from '../src/schema/cf';
import {
  actionLogs,
  featureFlags,
  invitations,
  members,
  users,
  workspaces,
} from '../src/schema/core';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  newId,
  seedAiUsage,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

const RLS_VIOLATION = '42501'; // new row violates row-level security / permission denied

let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let userBoth: string; // thành viên của cả A và B
let userOnlyB: string;
let memberAOfBoth: string;
let memberBOfBoth: string;
let usageB: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  userBoth = await seedUser(admin);
  userOnlyB = await seedUser(admin);
  memberAOfBoth = await seedMember(admin, wsA, userBoth, 'staff');
  memberBOfBoth = await seedMember(admin, wsB, userBoth, 'staff');
  await seedMember(admin, wsB, userOnlyB, 'owner');
  usageB = await seedAiUsage(admin, wsB, 'cua-b');
  await seedAiUsage(admin, wsA, 'cua-a');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('cô lập dữ liệu giữa workspace (bảng có workspace_id)', () => {
  it('A không đọc được dòng của B dù biết chính xác id', async () => {
    const rows = await db.withWorkspace(wsA, (tx) =>
      tx.select().from(aiUsage).where(eq(aiUsage.id, usageB)),
    );
    expect(rows).toHaveLength(0);
  });

  it('A không sửa được dòng của B (0 dòng bị ảnh hưởng, dữ liệu nguyên vẹn)', async () => {
    const updated = await db.withWorkspace(wsA, (tx) =>
      tx.update(members).set({ role: 'owner' }).where(eq(members.workspaceId, wsB)).returning(),
    );
    expect(updated).toHaveLength(0);
    const { rows } = await admin.query('SELECT role FROM core.members WHERE id = $1', [
      memberBOfBoth,
    ]);
    expect(rows[0].role).toBe('staff');
  });

  it('KHÔNG xóa cứng được dòng members (kể cả của mình): gỡ thành viên = status "removed", giữ dòng', async () => {
    for (const ws of [wsA, wsB]) {
      expect(
        await expectRejectCode(
          db.withWorkspace(ws, (tx) => tx.delete(members).where(eq(members.workspaceId, ws))),
        ),
      ).toBe(RLS_VIOLATION);
    }
    // Gỡ thành viên bằng status: dòng còn nguyên.
    const user = await seedUser(admin);
    const id = await seedMember(admin, wsA, user, 'staff');
    await db.withWorkspace(wsA, (tx) =>
      tx.update(members).set({ status: 'removed' }).where(eq(members.id, id)),
    );
    const { rows } = await admin.query('SELECT status FROM core.members WHERE id = $1', [id]);
    expect(rows).toEqual([{ status: 'removed' }]);
  });

  it('members.status chỉ nhận active | suspended | removed (CHECK)', async () => {
    const user = await seedUser(admin);
    const id = await seedMember(admin, wsA, user, 'staff');
    for (const ok of ['active', 'suspended', 'removed']) {
      await db.withWorkspace(wsA, (tx) =>
        tx.update(members).set({ status: ok }).where(eq(members.id, id)),
      );
    }
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) =>
          tx.update(members).set({ status: 'bogus' }).where(eq(members.id, id)),
        ),
      ),
    ).toBe('23514'); // check_violation
  });

  it('A không chèn được dòng mang workspace_id của B (vi phạm RLS)', async () => {
    const code = await expectRejectCode(
      db.withWorkspace(wsA, (tx) =>
        tx.insert(aiUsage).values({ workspaceId: wsB, step: 'gian-lan', model: 'm' }),
      ),
    );
    expect(code).toBe(RLS_VIOLATION);
  });

  it('A không chuyển được dòng của mình sang workspace B (WITH CHECK)', async () => {
    const code = await expectRejectCode(
      db.withWorkspace(wsA, (tx) =>
        tx.update(members).set({ workspaceId: wsB }).where(eq(members.id, memberAOfBoth)),
      ),
    );
    expect(code).toBe(RLS_VIOLATION);
  });

  it('invitations: cô lập theo workspace cả đọc lẫn ghi', async () => {
    const insertedB = await db.withWorkspace(wsB, (tx) =>
      tx
        .insert(invitations)
        .values({
          workspaceId: wsB,
          email: 'moi@example.test',
          role: 'staff',
          tokenHash: `hash-${newId()}`,
          expiresAt: new Date(Date.now() + 3600_000),
        })
        .returning({ id: invitations.id }),
    );
    expect(insertedB).toHaveLength(1);
    expect(await db.withWorkspace(wsA, (tx) => tx.select().from(invitations))).toHaveLength(0);
    const code = await expectRejectCode(
      db.withWorkspace(wsA, (tx) =>
        tx.insert(invitations).values({
          workspaceId: wsB,
          email: 'x@example.test',
          role: 'staff',
          tokenHash: `hash-${newId()}`,
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      ),
    );
    expect(code).toBe(RLS_VIOLATION);
  });
});

describe('bảng chỉ thêm (action_logs, ai_usage) và bảng cờ tính năng', () => {
  it('action_logs: ghi được trong workspace của mình, không sửa, không xóa', async () => {
    const id = newId();
    await db.withWorkspace(wsA, (tx) =>
      tx.insert(actionLogs).values({ id, workspaceId: wsA, actorType: 'system', action: 'thu' }),
    );
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) =>
          tx.update(actionLogs).set({ action: 'sua' }).where(eq(actionLogs.id, id)),
        ),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) => tx.delete(actionLogs).where(eq(actionLogs.id, id))),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) =>
          tx.insert(actionLogs).values({ workspaceId: wsB, actorType: 'system', action: 'x' }),
        ),
      ),
    ).toBe(RLS_VIOLATION);
  });

  it('ai_usage: ghi được trong workspace của mình, không sửa/xóa', async () => {
    const id = newId();
    await db.withWorkspace(wsA, (tx) =>
      tx.insert(aiUsage).values({ id, workspaceId: wsA, step: 's', model: 'm' }),
    );
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) =>
          tx.update(aiUsage).set({ step: 'sua' }).where(eq(aiUsage.id, id)),
        ),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) => tx.delete(aiUsage).where(eq(aiUsage.id, id))),
      ),
    ).toBe(RLS_VIOLATION);
  });

  it('feature_flags: ứng dụng chỉ đọc được, không ghi được', async () => {
    expect(await db.withSystem((tx) => tx.select().from(featureFlags))).toBeDefined();
    const code = await expectRejectCode(
      db.withSystem((tx) =>
        tx.insert(featureFlags).values({ key: 'cf.thu', product: 'commentflow', kind: 'ops' }),
      ),
    );
    expect(code).toBe(RLS_VIOLATION);
  });
});

describe('workspaces và members: liệt kê workspace của chính người dùng', () => {
  it('trong ngữ cảnh workspace A (không userId) chỉ thấy workspace A', async () => {
    const rows = await db.withWorkspace(wsA, (tx) =>
      tx.select({ id: workspaces.id }).from(workspaces),
    );
    expect(rows.map((r) => r.id)).toEqual([wsA]);
  });

  it('withUser thấy mọi workspace mình là thành viên, không thấy workspace khác', async () => {
    const mine = await db.withUser(userBoth, (tx) =>
      tx.select({ id: workspaces.id }).from(workspaces),
    );
    expect(mine.map((r) => r.id).sort()).toEqual([wsA, wsB].sort());

    const memberships = await db.withUser(userBoth, (tx) => tx.select().from(members));
    expect(memberships.every((m) => m.userId === userBoth)).toBe(true);
    expect(memberships).toHaveLength(2);
  });

  it('người chỉ thuộc B không thấy workspace A', async () => {
    const mine = await db.withUser(userOnlyB, (tx) =>
      tx.select({ id: workspaces.id }).from(workspaces),
    );
    expect(mine.map((r) => r.id)).toEqual([wsB]);
  });

  it('đọc chéo chỉ khi KHÔNG có ngữ cảnh workspace: trong withWorkspace(A) không thấy B, kể cả khi app.user_id cũng được đặt', async () => {
    // Trường hợp xấu nhất: cả hai biến cùng được đặt (ví dụ lỗi ở tầng ứng dụng).
    const both = await db.withSystem(async (tx) => {
      await tx.execute(
        sql`select set_config('app.workspace_id', ${wsA}, true), set_config('app.user_id', ${userBoth}, true)`,
      );
      return {
        ws: await tx.select({ id: workspaces.id }).from(workspaces),
        ms: await tx.select({ id: members.id, workspaceId: members.workspaceId }).from(members),
      };
    });
    expect(both.ws.map((r) => r.id)).toEqual([wsA]);
    expect(both.ms.every((m) => m.workspaceId === wsA)).toBe(true);
  });

  it('thành viên không còn active (status khác active) không được liệt kê qua withUser', async () => {
    const user = await seedUser(admin);
    const ws = await seedWorkspace(admin);
    const id = await seedMember(admin, ws, user, 'staff');
    expect(
      (await db.withUser(user, (tx) => tx.select().from(workspaces))).map((r) => r.id),
    ).toEqual([ws]);
    await admin.query("UPDATE core.members SET status = 'removed' WHERE id = $1", [id]);
    expect(await db.withUser(user, (tx) => tx.select().from(workspaces))).toHaveLength(0);
    expect(await db.withUser(user, (tx) => tx.select().from(members))).toHaveLength(0);
  });

  it('không tự nâng vai trò ở workspace khác (ghi chỉ trong workspace hiện tại)', async () => {
    const updated = await db.withWorkspace(wsA, (tx) =>
      tx
        .update(members)
        .set({ role: 'owner' })
        .where(and(eq(members.id, memberBOfBoth), eq(members.userId, userBoth)))
        .returning(),
    );
    expect(updated).toHaveLength(0);
    const { rows } = await admin.query('SELECT role FROM core.members WHERE id = $1', [
      memberBOfBoth,
    ]);
    expect(rows[0].role).toBe('staff');
  });

  it('không sửa được workspace khác; KHÔNG xóa cứng được workspace nào (không có quyền DELETE)', async () => {
    const updated = await db.withWorkspace(wsA, (tx) =>
      tx.update(workspaces).set({ name: 'đổi tên' }).where(eq(workspaces.id, wsB)).returning(),
    );
    expect(updated).toHaveLength(0);
    // Ngay cả workspace của chính mình cũng không xóa cứng được từ role ứng dụng (xóa mềm bằng status).
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) => tx.delete(workspaces).where(eq(workspaces.id, wsA))),
      ),
    ).toBe(RLS_VIOLATION);
    const { rows } = await admin.query('SELECT 1 FROM core.workspaces WHERE id = $1', [wsA]);
    expect(rows).toHaveLength(1);
  });

  it('tạo workspace: id phải trùng ngữ cảnh; thêm người tạo làm owner trong cùng giao dịch', async () => {
    const owner = await seedUser(admin);
    const newWs = newId();
    await db.withWorkspace(newWs, async (tx) => {
      await tx.insert(workspaces).values({ id: newWs, name: 'Mới', slug: `moi-${newWs}` });
      await tx.insert(members).values({ workspaceId: newWs, userId: owner, role: 'owner' });
    });
    const rows = await db.withUser(owner, (tx) =>
      tx.select({ id: workspaces.id }).from(workspaces),
    );
    expect(rows.map((r) => r.id)).toEqual([newWs]);

    const other = newId();
    const code = await expectRejectCode(
      db.withWorkspace(other, (tx) =>
        tx
          .insert(workspaces)
          .values({ id: newWs.replace(/.$/, '0'), name: 'Lạ', slug: `la-${other}` }),
      ),
    );
    expect(code).toBe(RLS_VIOLATION);
  });
});

describe('quyền trên core.users và hàm ngữ cảnh', () => {
  it('cf_app (withUser) đổi được tên/ngôn ngữ của mình nhưng KHÔNG tự đặt is_admin/admin_role, không xóa người dùng', async () => {
    const id = await seedUser(admin);
    await db.withUser(id, (tx) =>
      tx.update(users).set({ name: 'Tên mới', locale: 'en' }).where(eq(users.id, id)),
    );
    const [row] = await db.withUser(id, (tx) =>
      tx.select({ name: users.name, locale: users.locale }).from(users).where(eq(users.id, id)),
    );
    expect(row).toMatchObject({ name: 'Tên mới', locale: 'en' });

    expect(
      await expectRejectCode(
        db.withUser(id, (tx) => tx.update(users).set({ isAdmin: true }).where(eq(users.id, id))),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(
        db.withUser(id, (tx) =>
          tx.update(users).set({ adminRole: 'super' }).where(eq(users.id, id)),
        ),
      ),
    ).toBe(RLS_VIOLATION);
    expect(
      await expectRejectCode(db.withUser(id, (tx) => tx.delete(users).where(eq(users.id, id)))),
    ).toBe(RLS_VIOLATION);
  });

  it('PUBLIC không có quyền EXECUTE trên hàm ngữ cảnh; cf_app có hàm workspace/user nhưng KHÔNG có in_auth_context; cf_auth có in_auth_context', async () => {
    const { rows } = await admin.query(`
      SELECT has_function_privilege('public', 'core.current_workspace_id()', 'execute') AS pub_ws,
             has_function_privilege('public', 'core.current_user_id()', 'execute') AS pub_user,
             has_function_privilege('public', 'core.in_auth_context()', 'execute') AS pub_ctx,
             has_function_privilege('cf_app', 'core.current_workspace_id()', 'execute') AS app_ws,
             has_function_privilege('cf_app', 'core.in_auth_context()', 'execute') AS app_ctx,
             has_function_privilege('cf_auth', 'core.in_auth_context()', 'execute') AS auth_ctx`);
    expect(rows[0]).toEqual({
      pub_ws: false,
      pub_user: false,
      pub_ctx: false,
      app_ws: true,
      app_ctx: false,
      auth_ctx: true,
    });
  });
});
