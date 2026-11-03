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

// --- Dữ liệu mẫu giống đầu ra thật của pg_get_expr ---
const WS = '(workspace_id = ( SELECT core.current_workspace_id() AS current_workspace_id))';
const AUTH_OWN =
  '(( SELECT core.in_auth_context() AS in_auth_context) OR ((( SELECT core.current_workspace_id() AS current_workspace_id) IS NULL) AND (user_id = ( SELECT core.current_user_id() AS current_user_id))))';
const AUTH_ONLY = '( SELECT core.in_auth_context() AS in_auth_context)';

const table = (name: string, over: Row = {}) => ({
  name,
  rls: true,
  owner: 'cf_owner',
  has_workspace_id: name !== 'core.sessions' && name !== 'core.verifications',
  policies: 4,
  ...over,
});
const grant = (name: string, over: Row = {}) => ({
  name,
  can_select: true,
  can_insert: true,
  can_update: true,
  can_delete: true,
  ...over,
});
const policy = (name: string, polcmd: string, over: Row = {}) => ({
  name,
  polname: `${name}_${polcmd}`,
  polcmd,
  permissive: true,
  applies_to_app: true,
  qual: polcmd === 'a' ? null : WS,
  withcheck: polcmd === 'a' || polcmd === 'w' ? WS : null,
  ...over,
});
const four = (name: string, over: Row = {}) =>
  ['r', 'a', 'w', 'd'].map((c) => policy(name, c, over));

const M = 'core.members';
const base = { tables: [table(M)], privileges: [grant(M)], policies: four(M) };

describe('checkRls — bảng workspace', () => {
  it('không có vi phạm khi mọi thứ đúng', async () => {
    expect(await checkRls(fakeDb(base))).toEqual([]);
  });

  it('bảng workspaces (khóa chính là định danh) cũng bắt buộc RLS + policy', async () => {
    const v = await checkRls(
      fakeDb({
        tables: [table('core.workspaces', { rls: false, has_workspace_id: false, policies: 0 })],
      }),
    );
    const text = v.map((x) => x.message).join('|');
    expect(text).toContain('RLS');
    expect(text).toContain('policy');
  });

  it('bắt policy USING (true)', async () => {
    const weak = four(M, { qual: 'true', withcheck: 'true' }).map((p) =>
      p.polcmd === 'a' ? { ...p, qual: null } : p,
    );
    const v = await checkRls(fakeDb({ ...base, policies: weak }));
    const text = v.map((x) => x.message).join('|');
    for (const c of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(text).toContain(`quyền ${c} nhưng không có policy ${c}`);
    }
  });

  it('bắt một policy permissive mở toang đi kèm một policy đúng (permissive cộng dồn bằng OR)', async () => {
    const policies = [...four(M), policy(M, 'r', { polname: 'mo_het', qual: 'true' })];
    const v = await checkRls(fakeDb({ ...base, policies }));
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: M,
        message: expect.stringContaining('policy "mo_het" mở quá rộng'),
      }),
    );
  });

  it('bắt biểu thức chứa "OR true" dù có nhắc current_workspace_id()', async () => {
    const policies = four(M).map((p) => (p.polcmd === 'r' ? { ...p, qual: `(${WS} OR true)` } : p));
    const v = await checkRls(fakeDb({ ...base, policies }));
    expect(v.map((x) => x.message).join('|')).toContain(
      'quyền SELECT nhưng không có policy SELECT',
    );
  });

  it('bắt WITH CHECK (true) của UPDATE và INSERT (cho phép chuyển dữ liệu sang workspace khác)', async () => {
    const policies = four(M).map((p) =>
      p.polcmd === 'w' || p.polcmd === 'a' ? { ...p, withcheck: 'true' } : p,
    );
    const v = await checkRls(fakeDb({ ...base, policies }));
    const text = v.map((x) => x.message).join('|');
    expect(text).toContain('quyền UPDATE nhưng không có policy UPDATE');
    expect(text).toContain('quyền INSERT nhưng không có policy INSERT');
  });

  it('policy FOR ALL: INSERT dùng WITH CHECK nếu có (WITH CHECK (true) → đỏ), nếu thiếu thì dùng USING', async () => {
    const all = (withcheck: unknown) => [
      {
        name: M,
        polname: 'iso',
        polcmd: '*',
        permissive: true,
        applies_to_app: true,
        qual: WS,
        withcheck,
      },
    ];
    expect(await checkRls(fakeDb({ ...base, policies: all(WS) }))).toEqual([]);
    expect(await checkRls(fakeDb({ ...base, policies: all(null) }))).toEqual([]);
    const v = await checkRls(fakeDb({ ...base, policies: all('true') }));
    expect(v.map((x) => x.message).join('|')).toContain(
      'quyền INSERT nhưng không có policy INSERT',
    );
  });

  it('bắt quyền UPDATE/DELETE thiếu policy đúng lệnh (lỗi im lặng: 0 dòng)', async () => {
    const v = await checkRls(fakeDb({ ...base, policies: [policy(M, 'r'), policy(M, 'a')] }));
    const text = v.map((x) => x.message).join('|');
    expect(text).toContain('quyền UPDATE nhưng không có policy UPDATE');
    expect(text).toContain('quyền DELETE nhưng không có policy DELETE');
    expect(text).not.toContain('quyền SELECT nhưng');
  });

  it('không đòi policy cho lệnh cf_app không có quyền (bảng chỉ thêm: SELECT + INSERT)', async () => {
    const v = await checkRls(
      fakeDb({
        ...base,
        privileges: [grant(M, { can_update: false, can_delete: false })],
        policies: [policy(M, 'r'), policy(M, 'a')],
      }),
    );
    expect(v).toEqual([]);
  });

  it('policy chỉ áp cho vai trò khác (TO cf_owner) KHÔNG được tính là phủ cf_app', async () => {
    const v = await checkRls(fakeDb({ ...base, policies: four(M, { applies_to_app: false }) }));
    expect(v.map((x) => x.message).join('|')).toContain('không có policy nào áp cho cf_app');
  });

  it('policy restrictive (permissive = false) không được tính là phủ quyền', async () => {
    const v = await checkRls(fakeDb({ ...base, policies: four(M, { permissive: false }) }));
    expect(v.map((x) => x.message).join('|')).toContain('không có policy nào áp cho cf_app');
  });

  it('biểu thức sai mẫu (không so workspace_id với current_workspace_id()) → đỏ', async () => {
    const odd = '(core.current_workspace_id() IS NOT NULL)';
    const v = await checkRls(fakeDb({ ...base, policies: four(M, { qual: odd }) }));
    expect(v.map((x) => x.message).join('|')).toContain(
      'quyền SELECT nhưng không có policy SELECT',
    );
  });
});

describe('checkRls — bảng xác thực (ngữ cảnh auth)', () => {
  const S = 'core.sessions';
  const authPolicies = (name: string, expr: string) => [
    {
      name,
      polname: `${name}_access`,
      polcmd: '*',
      permissive: true,
      applies_to_app: true,
      qual: expr,
      withcheck: expr,
    },
  ];

  it('sessions đúng mẫu (auth hoặc của chính mình) → không vi phạm', async () => {
    const v = await checkRls(
      fakeDb({
        tables: [table(S)],
        privileges: [grant(S)],
        policies: authPolicies(S, AUTH_OWN),
      }),
    );
    expect(v).toEqual([]);
  });

  it('sessions thiếu nhánh "của chính mình" (chỉ in_auth_context) → đỏ', async () => {
    const v = await checkRls(
      fakeDb({
        tables: [table(S)],
        privileges: [grant(S)],
        policies: authPolicies(S, AUTH_ONLY),
      }),
    );
    expect(v).toContainEqual(expect.objectContaining({ subject: S }));
  });

  it('verifications chỉ cần in_auth_context; policy dùng current_workspace_id thay vì auth → đỏ', async () => {
    const V = 'core.verifications';
    const ok = await checkRls(
      fakeDb({ tables: [table(V)], privileges: [grant(V)], policies: authPolicies(V, AUTH_ONLY) }),
    );
    expect(ok).toEqual([]);
    const bad = await checkRls(
      fakeDb({ tables: [table(V)], privileges: [grant(V)], policies: authPolicies(V, WS) }),
    );
    expect(bad).toContainEqual(expect.objectContaining({ subject: V }));
  });

  it('bảng xác thực tắt RLS hoặc không có policy → đỏ', async () => {
    const v = await checkRls(fakeDb({ tables: [table(S, { rls: false, policies: 0 })] }));
    const text = v.map((x) => x.message).join('|');
    expect(text).toContain('chưa bật RLS');
    expect(text).toContain('chưa có policy nào');
  });

  it('two_factors (khi được tạo) thuộc nhóm "của chính mình": thiếu policy đúng mẫu → đỏ', async () => {
    const T = 'core.two_factors';
    const v = await checkRls(
      fakeDb({
        tables: [table(T, { has_workspace_id: false })],
        privileges: [grant(T)],
        policies: [],
      }),
    );
    expect(v.map((x) => x.message).join('|')).toContain('không có policy nào áp cho cf_app');
  });
});

describe('checkRls — nhóm bảng, role, quyền', () => {
  it('bảng hệ thống feature_flags được miễn RLS; bảng lạ không khai báo → đỏ', async () => {
    const ok = await checkRls(
      fakeDb({
        tables: [table('core.feature_flags', { rls: false, has_workspace_id: false, policies: 0 })],
      }),
    );
    expect(ok).toEqual([]);
    const v = await checkRls(
      fakeDb({ tables: [table('core.bang_la', { has_workspace_id: false })] }),
    );
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.bang_la' }));
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
    const v = await checkRls(fakeDb({ ...base, tables: [table(M, { owner: 'cf_app' })] }));
    expect(v).toContainEqual(
      expect.objectContaining({ subject: M, message: expect.stringContaining('sở hữu') }),
    );
  });

  it('bắt view/materialized view và quyền cấp cho PUBLIC', async () => {
    const v = await checkRls(
      fakeDb({
        ...base,
        views: [{ name: 'core.v_tong_quan' }],
        publicGrants: [{ name: 'core.users', privilege_type: 'SELECT' }],
      }),
    );
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.v_tong_quan' }));
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.users',
        message: expect.stringContaining('PUBLIC'),
      }),
    );
  });
});
