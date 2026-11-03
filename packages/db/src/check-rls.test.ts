import { describe, expect, it } from 'vitest';
import { checkRls, type Queryable } from './check-rls';

type Row = Record<string, unknown>;

/** DB giả: trả dữ liệu cố định theo thẻ chú thích đầu mỗi câu truy vấn (không cần kết nối thật). */
function fakeDb(parts: {
  tables?: Row[];
  privileges?: Row[];
  policies?: Row[];
  views?: Row[];
  role?: Row | null;
  create?: Row;
  publicGrants?: Row[];
}): Queryable {
  const noCreate = { core_create: false, cf_create: false, public_create: false, db_create: false };
  return {
    query: async (text) => {
      if (text.includes('/* tables */')) return { rows: parts.tables ?? [] };
      if (text.includes('/* privileges */')) return { rows: parts.privileges ?? [] };
      if (text.includes('/* policies */')) return { rows: parts.policies ?? [] };
      if (text.includes('/* views */')) return { rows: parts.views ?? [] };
      if (text.includes('/* role */')) {
        const ok = {
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        };
        return { rows: parts.role === null ? [] : [parts.role ?? ok] };
      }
      if (text.includes('/* create-privileges */')) return { rows: [parts.create ?? noCreate] };
      if (text.includes('/* public-grants */')) return { rows: parts.publicGrants ?? [] };
      throw new Error(`câu truy vấn lạ: ${text.slice(0, 40)}`);
    },
  };
}

const okTable = {
  name: 'core.members',
  rls: true,
  owner: 'cf_owner',
  has_workspace_id: true,
  policies: 4,
};
const grant = (over: Row = {}) => ({
  name: 'core.members',
  can_select: true,
  can_insert: true,
  can_update: true,
  can_delete: true,
  ...over,
});
const ctx = 'workspace_id = ( SELECT core.current_workspace_id() AS current_workspace_id)';
const policy = (polcmd: string, over: Row = {}) => ({
  name: 'core.members',
  polname: `p_${polcmd}`,
  polcmd,
  qual: polcmd === 'a' ? null : ctx,
  withcheck: polcmd === 'a' || polcmd === 'w' ? ctx : null,
  ...over,
});
const fullPolicies = ['r', 'a', 'w', 'd'].map((c) => policy(c));

const base = { tables: [okTable], privileges: [grant()], policies: fullPolicies };

describe('checkRls (kiểm bằng DB giả)', () => {
  it('không có vi phạm khi mọi thứ đúng', async () => {
    expect(await checkRls(fakeDb(base))).toEqual([]);
  });

  it('bắt cf_app có BYPASSRLS / superuser / CREATEDB / CREATEROLE / không tồn tại', async () => {
    const mk = (role: Row | null) => checkRls(fakeDb({ ...base, role }));
    const flags = {
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    };
    expect(await mk({ ...flags, rolbypassrls: true })).toContainEqual({
      subject: 'cf_app',
      message: 'có BYPASSRLS',
    });
    expect(await mk({ ...flags, rolsuper: true })).toContainEqual({
      subject: 'cf_app',
      message: 'là superuser',
    });
    expect(await mk({ ...flags, rolcreatedb: true })).toContainEqual({
      subject: 'cf_app',
      message: 'có quyền CREATEDB',
    });
    expect(await mk({ ...flags, rolcreaterole: true })).toContainEqual({
      subject: 'cf_app',
      message: 'có quyền CREATEROLE',
    });
    expect(await mk(null)).toContainEqual({ subject: 'cf_app', message: 'role không tồn tại' });
  });

  it('bắt cf_app có quyền CREATE trên schema hoặc database', async () => {
    const v = await checkRls(
      fakeDb({
        ...base,
        create: { core_create: true, cf_create: false, public_create: true, db_create: true },
      }),
    );
    expect(v.map((x) => x.message)).toEqual(
      expect.arrayContaining([
        'có quyền CREATE trên schema core',
        'có quyền CREATE trên schema public',
        'có quyền CREATE trên database',
      ]),
    );
  });

  it('bắt cf_app làm chủ bảng', async () => {
    const v = await checkRls(fakeDb({ ...base, tables: [{ ...okTable, owner: 'cf_app' }] }));
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
    const text = v.map((x) => x.message).join('|');
    expect(text).toContain('RLS');
    expect(text).toContain('policy');
  });

  it('bắt policy USING (true): có policy nhưng không dựa vào current_workspace_id()', async () => {
    const weak = ['r', 'a', 'w', 'd'].map((c) =>
      policy(c, {
        qual: c === 'a' ? null : 'true',
        withcheck: c === 'a' || c === 'w' ? 'true' : null,
      }),
    );
    const v = await checkRls(fakeDb({ ...base, policies: weak }));
    const text = v.map((x) => x.message).join('|');
    for (const command of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(text).toContain(`quyền ${command} nhưng không có policy ${command}`);
    }
  });

  it('bắt cf_app có quyền UPDATE/DELETE nhưng bảng thiếu policy lệnh đó (lỗi im lặng: 0 dòng)', async () => {
    const onlySelectInsert = [policy('r'), policy('a')];
    const v = await checkRls(fakeDb({ ...base, policies: onlySelectInsert }));
    const text = v.map((x) => x.message).join('|');
    expect(text).toContain('quyền UPDATE nhưng không có policy UPDATE');
    expect(text).toContain('quyền DELETE nhưng không có policy DELETE');
    expect(text).not.toContain('quyền SELECT nhưng');
  });

  it('không đòi policy cho lệnh mà cf_app không có quyền (bảng chỉ thêm: SELECT + INSERT)', async () => {
    const v = await checkRls(
      fakeDb({
        ...base,
        privileges: [grant({ can_update: false, can_delete: false })],
        policies: [policy('r'), policy('a')],
      }),
    );
    expect(v).toEqual([]);
  });

  it('policy FOR ALL (polcmd *) thỏa mọi lệnh nếu có USING và WITH CHECK dựa vào ngữ cảnh', async () => {
    const all = [{ name: 'core.members', polname: 'iso', polcmd: '*', qual: ctx, withcheck: ctx }];
    expect(await checkRls(fakeDb({ ...base, policies: all }))).toEqual([]);
  });

  it('bắt view/materialized view trong core hoặc cf', async () => {
    const v = await checkRls(fakeDb({ ...base, views: [{ name: 'core.v_tong_quan' }] }));
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.v_tong_quan' }));
  });

  it('bắt quyền cấp cho PUBLIC', async () => {
    const v = await checkRls(
      fakeDb({ ...base, publicGrants: [{ name: 'core.users', privilege_type: 'SELECT' }] }),
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.users',
        message: expect.stringContaining('PUBLIC'),
      }),
    );
  });
});
