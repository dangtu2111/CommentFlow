import { and, eq } from 'drizzle-orm';
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

  it('A không xóa được dòng của B', async () => {
    const deleted = await db.withWorkspace(wsA, (tx) =>
      tx.delete(members).where(eq(members.workspaceId, wsB)).returning(),
    );
    expect(deleted).toHaveLength(0);
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

  it('quyền ĐỌC chéo không kéo theo quyền GHI: không tự nâng vai trò ở workspace khác', async () => {
    const updated = await db.withWorkspace(
      wsA,
      (tx) =>
        tx
          .update(members)
          .set({ role: 'owner' })
          .where(and(eq(members.id, memberBOfBoth), eq(members.userId, userBoth)))
          .returning(),
      { userId: userBoth },
    );
    expect(updated).toHaveLength(0);
    const { rows } = await admin.query('SELECT role FROM core.members WHERE id = $1', [
      memberBOfBoth,
    ]);
    expect(rows[0].role).toBe('staff');
  });

  it('không sửa/xóa được workspace khác dù là thành viên', async () => {
    const updated = await db.withWorkspace(
      wsA,
      (tx) =>
        tx.update(workspaces).set({ name: 'đổi tên' }).where(eq(workspaces.id, wsB)).returning(),
      { userId: userBoth },
    );
    expect(updated).toHaveLength(0);
    const deleted = await db.withWorkspace(
      wsA,
      (tx) => tx.delete(workspaces).where(eq(workspaces.id, wsB)).returning(),
      { userId: userBoth },
    );
    expect(deleted).toHaveLength(0);
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

describe('bảng hệ thống (xác thực) dùng được qua đường system', () => {
  it('đọc/ghi users qua db.system', async () => {
    const id = newId();
    await db.system.insert(users).values({ id, email: `${id}@example.test`, name: 'Hệ thống' });
    const rows = await db.system.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(1);
  });
});
