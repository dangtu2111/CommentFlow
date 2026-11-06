import type { FlowDb } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import { createTenancy, isValidTimeZone } from './tenancy';

const WS = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';

/** Chuỗi truy vấn giả: mọi bước trả chính nó, `await` ra `rows`. */
function chain(rows: unknown[]) {
  const q: Record<string, unknown> = Promise.resolve(rows) as never;
  for (const m of ['select', 'from', 'where', 'innerJoin', 'orderBy']) q[m] = () => q;
  return q;
}

function fakeDb(rows: unknown[] = []) {
  const inserted: unknown[] = [];
  const tx = {
    select: () => chain(rows),
    insert: () => ({
      values: async (v: unknown) => {
        inserted.push(v);
      },
    }),
  };
  const withWorkspace = vi.fn(async (_id: string, fn: (t: unknown) => unknown) => fn(tx));
  const withUser = vi.fn(async (_id: string, fn: (t: unknown) => unknown) => fn(tx));
  const withActor = vi.fn(async (_w: string, _u: string, fn: (t: unknown) => unknown) => fn(tx));
  return {
    db: { withWorkspace, withUser, withActor } as unknown as FlowDb,
    inserted,
    withWorkspace,
    withActor,
  };
}

describe('tenancy (đơn vị, DB giả)', () => {
  it('isValidTimeZone so khớp đúng chữ trong danh sách cho phép', () => {
    expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidTimeZone('asia/ho_chi_minh')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('getRole trả vai trò của thành viên đang hoạt động, null nếu không có dòng', async () => {
    expect(await createTenancy(fakeDb([{ role: 'owner' }]).db).getRole(WS, USER)).toBe('owner');
    expect(await createTenancy(fakeDb([]).db).getRole(WS, USER)).toBeNull();
  });

  it('getRole từ chối id không phải uuid, không chạm DB', async () => {
    const f = fakeDb();
    await expect(createTenancy(f.db).getRole('x', USER)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(createTenancy(f.db).getRole(WS, 'y')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(f.withWorkspace).not.toHaveBeenCalled();
  });

  it('createWorkspace: người tạo là owner, ghi workspace + member + action log trong withActor', async () => {
    const f = fakeDb();
    const result = await createTenancy(f.db).createWorkspace({ userId: USER, name: '  Shop A  ' });
    expect(result).toMatchObject({ name: 'Shop A', role: 'owner' });
    expect(f.withActor).toHaveBeenCalledWith(result.id, USER, expect.any(Function));
    expect(f.inserted).toHaveLength(3);
    expect(f.inserted[0]).toMatchObject({
      name: 'Shop A',
      timezone: 'Asia/Ho_Chi_Minh',
      defaultLang: 'vi',
      createdBy: USER,
    });
    expect(f.inserted[1]).toMatchObject({ workspaceId: result.id, userId: USER, role: 'owner' });
    expect(f.inserted[2]).toMatchObject({ action: 'workspace.created', actorId: USER });
  });

  it('createWorkspace từ chối tên rỗng/quá dài, múi giờ lạ, ngôn ngữ lạ; không mở giao dịch', async () => {
    const f = fakeDb();
    const t = createTenancy(f.db);
    await expect(t.createWorkspace({ userId: USER, name: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(t.createWorkspace({ userId: USER, name: 'a'.repeat(81) })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(
      t.createWorkspace({ userId: USER, name: 'A', timezone: 'Mars/Base' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      t.createWorkspace({ userId: USER, name: 'A', defaultLang: 'fr' as never }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(t.createWorkspace({ userId: 'x', name: 'A' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(f.withActor).not.toHaveBeenCalled();
  });

  it('listMembers và listWorkspacesOfUser trả các dòng, kiểm uuid trước', async () => {
    const rows = [{ userId: USER, name: 'An', email: 'a@x.vn', image: null, role: 'staff' }];
    expect(await createTenancy(fakeDb(rows).db).listMembers(WS)).toEqual(rows);
    const ws = [{ id: WS, name: 'S', slug: 's', role: 'owner' }];
    expect(await createTenancy(fakeDb(ws).db).listWorkspacesOfUser(USER)).toEqual(ws);
    await expect(createTenancy(fakeDb().db).listMembers('x')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(createTenancy(fakeDb().db).listWorkspacesOfUser('x')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
