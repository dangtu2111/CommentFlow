import { describe, expect, it } from 'vitest';
import { checkRls, type Queryable } from './check-rls';

/** DB giả: trả dữ liệu cố định theo nội dung câu truy vấn (không cần kết nối thật). */
function fakeDb(parts: {
  tables?: Record<string, unknown>[];
  role?: Record<string, unknown> | null;
  publicGrants?: Record<string, unknown>[];
}): Queryable {
  return {
    query: async (text) => {
      if (text.includes('pg_roles'))
        return {
          rows: parts.role === null ? [] : [parts.role ?? { rolsuper: false, rolbypassrls: false }],
        };
      if (text.includes('role_table_grants')) return { rows: parts.publicGrants ?? [] };
      return { rows: parts.tables ?? [] };
    },
  };
}

const okTable = {
  name: 'core.members',
  rls: true,
  owner: 'cf_owner',
  has_workspace_id: true,
  policies: 2,
};

describe('checkRls (nhánh kiểm role và quyền)', () => {
  it('không có vi phạm khi mọi thứ đúng', async () => {
    expect(await checkRls(fakeDb({ tables: [okTable] }))).toEqual([]);
  });

  it('bắt cf_app có BYPASSRLS', async () => {
    const v = await checkRls(
      fakeDb({ tables: [okTable], role: { rolsuper: false, rolbypassrls: true } }),
    );
    expect(v).toContainEqual({ subject: 'cf_app', message: 'có BYPASSRLS' });
  });

  it('bắt cf_app là superuser', async () => {
    const v = await checkRls(
      fakeDb({ tables: [okTable], role: { rolsuper: true, rolbypassrls: false } }),
    );
    expect(v).toContainEqual({ subject: 'cf_app', message: 'là superuser' });
  });

  it('bắt role cf_app không tồn tại', async () => {
    const v = await checkRls(fakeDb({ tables: [okTable], role: null }));
    expect(v).toContainEqual({ subject: 'cf_app', message: 'role không tồn tại' });
  });

  it('bắt cf_app làm chủ bảng', async () => {
    const v = await checkRls(fakeDb({ tables: [{ ...okTable, owner: 'cf_app' }] }));
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.members',
        message: expect.stringContaining('sở hữu'),
      }),
    );
  });

  it('bảng workspaces (khóa chính là định danh workspace) cũng bắt buộc RLS + policy', async () => {
    const v = await checkRls(
      fakeDb({
        tables: [
          {
            name: 'core.workspaces',
            rls: false,
            owner: 'cf_owner',
            has_workspace_id: false,
            policies: 0,
          },
        ],
      }),
    );
    expect(v.map((x) => x.message).join('|')).toContain('RLS');
    expect(v.map((x) => x.message).join('|')).toContain('policy');
  });
});
