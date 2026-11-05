import { and, eq, type FlowDb } from '@flow/db';
import { actionLogs, members, workspaces } from '@flow/db/schema/core';
import { isAppError } from '@flow/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenancy } from '../src/tenancy';
import { createTestDb, createTestUser, seedMemberForTest } from './helpers';

let db: FlowDb;
let tenancy: ReturnType<typeof createTenancy>;

beforeAll(() => {
  db = createTestDb();
  tenancy = createTenancy(db);
});
afterAll(async () => {
  await db.close();
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : `KHÁC: ${String(error)}`;
  }
  return undefined;
};

describe('createWorkspace', () => {
  it('tạo workspace, người tạo là owner, slug bỏ dấu và không trùng', async () => {
    const owner = await createTestUser();
    const a = await tenancy.createWorkspace({ userId: owner, name: 'Cửa hàng Bé Yêu' });
    const b = await tenancy.createWorkspace({ userId: owner, name: 'Cửa hàng Bé Yêu' });
    expect(a.slug).toMatch(/^cua-hang-be-yeu-[0-9a-f]{6}$/);
    expect(a.slug).not.toBe(b.slug);
    expect(a.role).toBe('owner');
    expect(await tenancy.getRole(a.id, owner)).toBe('owner');
  });

  it('từ chối tên rỗng hoặc quá dài', async () => {
    const owner = await createTestUser();
    expect(await codeOf(tenancy.createWorkspace({ userId: owner, name: '   ' }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(await codeOf(tenancy.createWorkspace({ userId: owner, name: 'x'.repeat(81) }))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('lưu múi giờ + ngôn ngữ mặc định (mặc định Asia/Ho_Chi_Minh, vi) và ghi action_logs cùng giao dịch', async () => {
    const owner = await createTestUser();
    const def = await tenancy.createWorkspace({ userId: owner, name: 'Mặc định' });
    const custom = await tenancy.createWorkspace({
      userId: owner,
      name: 'Tùy chọn',
      timezone: 'America/New_York',
      defaultLang: 'en',
    });
    const read = (id: string) =>
      db.withJob(id, async (tx) => ({
        ws: (await tx.select().from(workspaces).where(eq(workspaces.id, id)))[0],
        logs: await tx.select().from(actionLogs).where(eq(actionLogs.workspaceId, id)),
      }));
    const d = await read(def.id);
    expect(d.ws).toMatchObject({ timezone: 'Asia/Ho_Chi_Minh', defaultLang: 'vi' });
    expect(d.logs).toHaveLength(1);
    expect(d.logs[0]).toMatchObject({
      actorType: 'user',
      actorId: owner,
      action: 'workspace.created',
      targetId: def.id,
    });
    const c = await read(custom.id);
    expect(c.ws).toMatchObject({ timezone: 'America/New_York', defaultLang: 'en' });
  });

  it('từ chối múi giờ lạ hoặc sai chữ hoa, và ngôn ngữ ngoài vi/en', async () => {
    const owner = await createTestUser();
    for (const timezone of ['Mars/Olympus', 'asia/ho_chi_minh', '', '+07:00']) {
      expect(await codeOf(tenancy.createWorkspace({ userId: owner, name: 'Shop', timezone }))).toBe(
        'VALIDATION_FAILED',
      );
    }
    expect(
      await codeOf(
        tenancy.createWorkspace({ userId: owner, name: 'Shop', defaultLang: 'fr' as 'vi' }),
      ),
    ).toBe('VALIDATION_FAILED');
  });

  it('từ chối userId không phải UUID', async () => {
    expect(await codeOf(tenancy.createWorkspace({ userId: 'khong-phai-uuid', name: 'Shop' }))).toBe(
      'VALIDATION_FAILED',
    );
  });
});

describe('listWorkspacesOfUser', () => {
  it('chỉ liệt kê workspace của chính người đó, kèm vai trò', async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const wsAlice = await tenancy.createWorkspace({ userId: alice, name: 'Shop của Alice' });
    const wsBob = await tenancy.createWorkspace({ userId: bob, name: 'Shop của Bob' });

    const ofAlice = await tenancy.listWorkspacesOfUser(alice);
    expect(ofAlice.map((w) => w.id)).toEqual([wsAlice.id]);
    const ofBob = await tenancy.listWorkspacesOfUser(bob);
    expect(ofBob.map((w) => w.id)).toEqual([wsBob.id]);
  });

  it('Staff không thấy workspace người khác; thấy cả hai khi thuộc nhiều workspace', async () => {
    const owner1 = await createTestUser();
    const owner2 = await createTestUser();
    const staff = await createTestUser();
    const ws1 = await tenancy.createWorkspace({ userId: owner1, name: 'Shop Một' });
    const ws2 = await tenancy.createWorkspace({ userId: owner2, name: 'Shop Hai' });
    await seedMemberForTest(ws1.id, staff, 'staff');

    expect((await tenancy.listWorkspacesOfUser(staff)).map((w) => w.id)).toEqual([ws1.id]);
    expect((await tenancy.listWorkspacesOfUser(staff))[0]?.role).toBe('staff');

    await seedMemberForTest(ws2.id, staff, 'staff');
    const both = (await tenancy.listWorkspacesOfUser(staff)).map((w) => w.id).sort();
    expect(both).toEqual([ws1.id, ws2.id].sort());
  });

  it('người chưa thuộc workspace nào nhận danh sách rỗng', async () => {
    expect(await tenancy.listWorkspacesOfUser(await createTestUser())).toEqual([]);
  });
});

describe('không có đường thêm thành viên thẳng (ADR 005, feat/members-invite-only)', () => {
  it('API tenancy không còn addMember', () => {
    expect('addMember' in tenancy).toBe(false);
  });

  it('Owner (withActor) INSERT thẳng vào members bị RLS chặn; dòng seed của test vẫn thấy được', async () => {
    const { sql } = await import('@flow/db');
    const owner = await createTestUser();
    const other = await createTestUser();
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Chỉ Mời' });
    await expect(
      db.withActor(ws.id, owner, (tx) =>
        tx.execute(
          sql`INSERT INTO core.members (workspace_id, user_id, role) VALUES (${ws.id}, ${other}, 'staff')`,
        ),
      ),
    ).rejects.toThrow();
    expect(await tenancy.getRole(ws.id, other)).toBeNull();
    await seedMemberForTest(ws.id, other, 'staff');
    expect(await tenancy.getRole(ws.id, other)).toBe('staff');
  });

  it('thành viên không còn active (suspended/removed) mất quyền: getRole null, không thấy workspace; dòng còn nguyên', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Gỡ Quyền' });
    await seedMemberForTest(ws.id, other, 'owner');
    for (const status of ['suspended', 'removed']) {
      await db.withActor(ws.id, owner, (tx) =>
        tx
          .update(members)
          .set({ status })
          .where(and(eq(members.workspaceId, ws.id), eq(members.userId, other))),
      );
      expect(await tenancy.getRole(ws.id, other)).toBeNull();
      expect((await tenancy.listWorkspacesOfUser(other)).map((w) => w.id)).not.toContain(ws.id);
      const rows = await db.withWorkspace(ws.id, (tx) =>
        tx
          .select()
          .from(members)
          .where(and(eq(members.workspaceId, ws.id), eq(members.userId, other))),
      );
      expect(rows).toHaveLength(1);
    }
  });
});

describe('listMembers (HARDEN-3: chỉ trả cột cần cho danh sách)', () => {
  it('trả đúng thành viên của workspace với đúng 5 trường, không lộ cột nhạy cảm, không lẫn workspace khác', async () => {
    const owner = await createTestUser('Bình');
    const staff = await createTestUser('An');
    const outsider = await createTestUser('Ngoài');
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop A' });
    const other = await tenancy.createWorkspace({ userId: outsider, name: 'Shop B' });
    await seedMemberForTest(ws.id, staff, 'staff');

    const list = await tenancy.listMembers(ws.id);
    expect(list.map((m) => [m.name, m.role])).toEqual([
      ['An', 'staff'],
      ['Bình', 'owner'],
    ]);
    for (const member of list) {
      expect(Object.keys(member).sort()).toEqual(['email', 'image', 'name', 'role', 'userId']);
    }
    expect(list.map((m) => m.userId)).not.toContain(outsider);
    expect((await tenancy.listMembers(other.id)).map((m) => m.userId)).toEqual([outsider]);
  });

  it('workspaceId không hợp lệ → VALIDATION_FAILED', async () => {
    expect(await codeOf(tenancy.listMembers('khong-phai-uuid'))).toBe('VALIDATION_FAILED');
  });
});
