import { and, eq, type FlowDb } from '@flow/db';
import { members } from '@flow/db/schema/core';
import { isAppError } from '@flow/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenancy } from '../src/tenancy';
import { createTestDb, createTestUser } from './helpers';

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
    const owner = await createTestUser(db);
    const a = await tenancy.createWorkspace({ userId: owner, name: 'Cửa hàng Bé Yêu' });
    const b = await tenancy.createWorkspace({ userId: owner, name: 'Cửa hàng Bé Yêu' });
    expect(a.slug).toMatch(/^cua-hang-be-yeu-[0-9a-f]{6}$/);
    expect(a.slug).not.toBe(b.slug);
    expect(a.role).toBe('owner');
    expect(await tenancy.getRole(a.id, owner)).toBe('owner');
  });

  it('từ chối tên rỗng hoặc quá dài', async () => {
    const owner = await createTestUser(db);
    expect(await codeOf(tenancy.createWorkspace({ userId: owner, name: '   ' }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(await codeOf(tenancy.createWorkspace({ userId: owner, name: 'x'.repeat(81) }))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('từ chối userId không phải UUID', async () => {
    expect(await codeOf(tenancy.createWorkspace({ userId: 'khong-phai-uuid', name: 'Shop' }))).toBe(
      'VALIDATION_FAILED',
    );
  });
});

describe('listWorkspacesOfUser', () => {
  it('chỉ liệt kê workspace của chính người đó, kèm vai trò', async () => {
    const alice = await createTestUser(db);
    const bob = await createTestUser(db);
    const wsAlice = await tenancy.createWorkspace({ userId: alice, name: 'Shop của Alice' });
    const wsBob = await tenancy.createWorkspace({ userId: bob, name: 'Shop của Bob' });

    const ofAlice = await tenancy.listWorkspacesOfUser(alice);
    expect(ofAlice.map((w) => w.id)).toEqual([wsAlice.id]);
    const ofBob = await tenancy.listWorkspacesOfUser(bob);
    expect(ofBob.map((w) => w.id)).toEqual([wsBob.id]);
  });

  it('Staff không thấy workspace người khác; thấy cả hai khi thuộc nhiều workspace', async () => {
    const owner1 = await createTestUser(db);
    const owner2 = await createTestUser(db);
    const staff = await createTestUser(db);
    const ws1 = await tenancy.createWorkspace({ userId: owner1, name: 'Shop Một' });
    const ws2 = await tenancy.createWorkspace({ userId: owner2, name: 'Shop Hai' });
    await tenancy.addMember({
      workspaceId: ws1.id,
      actorUserId: owner1,
      userId: staff,
      role: 'staff',
    });

    expect((await tenancy.listWorkspacesOfUser(staff)).map((w) => w.id)).toEqual([ws1.id]);
    expect((await tenancy.listWorkspacesOfUser(staff))[0]?.role).toBe('staff');

    await tenancy.addMember({
      workspaceId: ws2.id,
      actorUserId: owner2,
      userId: staff,
      role: 'staff',
    });
    const both = (await tenancy.listWorkspacesOfUser(staff)).map((w) => w.id).sort();
    expect(both).toEqual([ws1.id, ws2.id].sort());
  });

  it('người chưa thuộc workspace nào nhận danh sách rỗng', async () => {
    expect(await tenancy.listWorkspacesOfUser(await createTestUser(db))).toEqual([]);
  });
});

describe('addMember', () => {
  it('owner thêm được Staff; thành viên mới thấy workspace', async () => {
    const owner = await createTestUser(db);
    const staff = await createTestUser(db);
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Thêm' });
    await tenancy.addMember({
      workspaceId: ws.id,
      actorUserId: owner,
      userId: staff,
      role: 'staff',
    });
    expect(await tenancy.getRole(ws.id, staff)).toBe('staff');
  });

  it('Staff không được thêm thành viên', async () => {
    const owner = await createTestUser(db);
    const staff = await createTestUser(db);
    const other = await createTestUser(db);
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Quyền' });
    await tenancy.addMember({
      workspaceId: ws.id,
      actorUserId: owner,
      userId: staff,
      role: 'staff',
    });
    expect(
      await codeOf(
        tenancy.addMember({ workspaceId: ws.id, actorUserId: staff, userId: other, role: 'staff' }),
      ),
    ).toBe('FORBIDDEN');
    expect(await tenancy.getRole(ws.id, other)).toBeNull();
  });

  it('người ngoài workspace không được thêm thành viên', async () => {
    const owner = await createTestUser(db);
    const stranger = await createTestUser(db);
    const target = await createTestUser(db);
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Kín' });
    expect(
      await codeOf(
        tenancy.addMember({
          workspaceId: ws.id,
          actorUserId: stranger,
          userId: target,
          role: 'staff',
        }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('owner của workspace A không thêm được người vào workspace B', async () => {
    const ownerA = await createTestUser(db);
    const ownerB = await createTestUser(db);
    const target = await createTestUser(db);
    await tenancy.createWorkspace({ userId: ownerA, name: 'Shop A' });
    const wsB = await tenancy.createWorkspace({ userId: ownerB, name: 'Shop B' });
    expect(
      await codeOf(
        tenancy.addMember({
          workspaceId: wsB.id,
          actorUserId: ownerA,
          userId: target,
          role: 'staff',
        }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('thêm trùng thành viên → CONFLICT', async () => {
    const owner = await createTestUser(db);
    const staff = await createTestUser(db);
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Trùng' });
    await tenancy.addMember({
      workspaceId: ws.id,
      actorUserId: owner,
      userId: staff,
      role: 'staff',
    });
    expect(
      await codeOf(
        tenancy.addMember({ workspaceId: ws.id, actorUserId: owner, userId: staff, role: 'staff' }),
      ),
    ).toBe('CONFLICT');
  });

  it('vai trò không hợp lệ → VALIDATION_FAILED', async () => {
    const owner = await createTestUser(db);
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Vai Trò' });
    expect(
      await codeOf(
        tenancy.addMember({
          workspaceId: ws.id,
          actorUserId: owner,
          userId: await createTestUser(db),
          role: 'admin' as never,
        }),
      ),
    ).toBe('VALIDATION_FAILED');
  });

  it('thành viên không còn active (suspended/removed) mất quyền: getRole null, không thấy workspace, không thêm được người', async () => {
    const owner = await createTestUser(db);
    const other = await createTestUser(db);
    const target = await createTestUser(db);
    const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop Gỡ Quyền' });
    await tenancy.addMember({
      workspaceId: ws.id,
      actorUserId: owner,
      userId: other,
      role: 'owner',
    });

    for (const status of ['suspended', 'removed']) {
      await db.withWorkspace(ws.id, (tx) =>
        tx
          .update(members)
          .set({ status })
          .where(and(eq(members.workspaceId, ws.id), eq(members.userId, other))),
      );
      expect(await tenancy.getRole(ws.id, other)).toBeNull();
      expect((await tenancy.listWorkspacesOfUser(other)).map((w) => w.id)).not.toContain(ws.id);
      expect(
        await codeOf(
          tenancy.addMember({
            workspaceId: ws.id,
            actorUserId: other,
            userId: target,
            role: 'staff',
          }),
        ),
      ).toBe('FORBIDDEN');
      // Dòng vẫn còn trong DB (không xóa).
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
