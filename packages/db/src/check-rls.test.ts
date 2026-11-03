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
  functions?: Row[];
  authRole?: Row | null;
  authPrivileges?: Row[];
  sensitive?: Row[];
  usersColumns?: Row[];
  adminGuard?: Row[];
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
      if (text.includes('/* public-functions */')) return { rows: parts.functions ?? [] };
      if (text.includes('/* auth-role */')) {
        const ok = {
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        };
        return { rows: parts.authRole === null ? [] : [parts.authRole ?? ok] };
      }
      if (text.includes('/* sensitive-columns */')) return { rows: parts.sensitive ?? [] };
      if (text.includes('/* users-columns */')) return { rows: parts.usersColumns ?? [] };
      if (text.includes('/* admin-insert-guard */')) {
        return {
          rows: parts.adminGuard ?? [
            {
              polname: 'users_auth_no_admin_insert',
              withcheck: '((NOT is_admin) AND (admin_role IS NULL))',
            },
          ],
        };
      }
      if (text.includes('/* auth-create-privileges */')) return { rows: [noCreate] };
      if (text.includes('/* auth-privileges */')) return { rows: parts.authPrivileges ?? [] };
      throw new Error(`câu truy vấn lạ: ${text.slice(0, 40)}`);
    },
  };
}

// --- Dữ liệu mẫu giống đầu ra thật của pg_get_expr ---
const WS = '(workspace_id = ( SELECT core.current_workspace_id() AS current_workspace_id))';
// Điều kiện "của mình" cho cf_app (KHÔNG dựa vào app.ctx).
const OWN =
  '((( SELECT core.current_workspace_id() AS current_workspace_id) IS NULL) AND (user_id = ( SELECT core.current_user_id() AS current_user_id)))';
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

describe('checkRls — bảng xác thực của cf_app', () => {
  const S = 'core.sessions';
  const noWrite = { can_insert: false, can_update: false, can_delete: false };
  const selectPolicy = (name: string, expr: string) => [
    {
      name,
      polname: `${name}_own_select`,
      polcmd: 'r',
      permissive: true,
      applies_to_app: true,
      qual: expr,
      withcheck: null,
    },
  ];

  it('sessions: cf_app chỉ SELECT dòng của mình → không vi phạm', async () => {
    const v = await checkRls(
      fakeDb({
        tables: [table(S)],
        privileges: [grant(S, noWrite)],
        policies: selectPolicy(S, OWN),
      }),
    );
    expect(v).toEqual([]);
  });

  it('sessions: policy cho cf_app dựa vào in_auth_context() (cf_app không được vào ngữ cảnh auth) → đỏ', async () => {
    const v = await checkRls(
      fakeDb({
        tables: [table(S)],
        privileges: [grant(S, noWrite)],
        policies: selectPolicy(S, AUTH_ONLY),
      }),
    );
    expect(v).toContainEqual(expect.objectContaining({ subject: S }));
  });

  it('sessions: cf_app có quyền ghi (INSERT/UPDATE/DELETE) mà chỉ có policy SELECT → đỏ', async () => {
    const v = await checkRls(
      fakeDb({ tables: [table(S)], privileges: [grant(S)], policies: selectPolicy(S, OWN) }),
    );
    const text = v.map((x) => x.message).join('|');
    for (const c of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(text).toContain(`quyền ${c} nhưng không có policy ${c}`);
    }
  });

  it('verifications: cf_app có BẤT KỲ quyền nào → đỏ; không có quyền → đạt', async () => {
    const V = 'core.verifications';
    const none = { can_select: false, can_insert: false, can_update: false, can_delete: false };
    const ok = await checkRls(fakeDb({ tables: [table(V)], privileges: [grant(V, none)] }));
    expect(ok).toEqual([]);
    const bad = await checkRls(
      fakeDb({ tables: [table(V)], privileges: [grant(V, { ...none, can_select: true })] }),
    );
    expect(bad).toContainEqual(
      expect.objectContaining({
        subject: V,
        message: expect.stringContaining('không được có quyền nào trên bảng chỉ dành cho cf_auth'),
      }),
    );
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
    expect(v.map((x) => x.message).join('|')).toContain(
      'không được có quyền nào trên bảng chỉ dành cho cf_auth',
    );
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

describe('checkRls — kiểm chứng lần ba', () => {
  const S = 'core.sessions';
  const authPolicy = (expr: string) => [
    {
      name: S,
      polname: 'sessions_access',
      polcmd: '*',
      permissive: true,
      applies_to_app: true,
      qual: expr,
      withcheck: expr,
    },
  ];
  const run = (expr: string) =>
    checkRls(fakeDb({ tables: [table(S)], privileges: [grant(S)], policies: authPolicy(expr) }));

  it('nhóm "của mình" mở toang theo kiểu khác (OR current_user_id() IS NOT NULL, OR 1 = 1, OR NOT false) → đỏ', async () => {
    const holes = [
      '(( SELECT core.in_auth_context() AS in_auth_context) OR (( SELECT core.current_user_id() AS current_user_id) IS NOT NULL))',
      `(${OWN} OR (1 = 1))`,
      `(${OWN} OR (NOT false))`,
    ];
    for (const expr of holes) {
      expect(await run(expr), expr).toContainEqual(expect.objectContaining({ subject: S }));
    }
  });

  it('nhóm "của mình" thiếu điều kiện "không có workspace" → đỏ', async () => {
    const noWorkspaceGuard = '(user_id = ( SELECT core.current_user_id() AS current_user_id))';
    expect(await run(noWorkspaceGuard)).toContainEqual(expect.objectContaining({ subject: S }));
  });

  it('bảng hệ thống feature_flags: cf_app có quyền ghi → đỏ; chỉ SELECT → đạt', async () => {
    const F = 'core.feature_flags';
    const t = table(F, { rls: false, has_workspace_id: false, policies: 0 });
    const ok = await checkRls(
      fakeDb({
        tables: [t],
        privileges: [grant(F, { can_insert: false, can_update: false, can_delete: false })],
      }),
    );
    expect(ok).toEqual([]);
    const bad = await checkRls(
      fakeDb({ tables: [t], privileges: [grant(F, { can_insert: true })] }),
    );
    expect(bad).toContainEqual(
      expect.objectContaining({
        subject: F,
        message: expect.stringContaining('chỉ cho cf_app quyền SELECT'),
      }),
    );
  });

  it('cf_app có TRUNCATE / TRIGGER / REFERENCES trên bất kỳ bảng nào → đỏ', async () => {
    for (const [field, label] of [
      ['can_truncate', 'TRUNCATE'],
      ['can_trigger', 'TRIGGER'],
      ['can_references', 'REFERENCES'],
    ] as const) {
      const v = await checkRls(fakeDb({ ...base, privileges: [grant(M, { [field]: true })] }));
      expect(v).toContainEqual(
        expect.objectContaining({ subject: M, message: expect.stringContaining(label) }),
      );
    }
  });

  it('hàm trong core/cf còn EXECUTE cho PUBLIC → đỏ', async () => {
    const v = await checkRls(fakeDb({ ...base, functions: [{ name: 'core.ham_cong_khai' }] }));
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.ham_cong_khai',
        message: expect.stringContaining('EXECUTE'),
      }),
    );
  });
});

describe('checkRls — role cf_auth', () => {
  const S = 'core.sessions';
  const none = { can_select: false, can_insert: false, can_update: false, can_delete: false };
  const authPriv = (name: string, over: Row = {}) => ({
    name,
    ...none,
    can_truncate: false,
    can_trigger: false,
    can_references: false,
    ...over,
  });
  const authPolicy = (over: Row = {}) => ({
    name: S,
    polname: 'sessions_auth_access',
    polcmd: '*',
    permissive: true,
    applies_to_app: false,
    applies_to_auth: true,
    qual: AUTH_ONLY,
    withcheck: AUTH_ONLY,
    ...over,
  });
  const run = (parts: { priv?: Row[]; policies?: Row[]; authRole?: Row | null }) =>
    checkRls(
      fakeDb({
        tables: [table(S)],
        privileges: [grant(S, none)],
        policies: parts.policies ?? [authPolicy()],
        authPrivileges: parts.priv ?? [authPriv(S, { can_select: true, can_insert: true })],
        ...(parts.authRole !== undefined ? { authRole: parts.authRole } : {}),
      }),
    );

  it('cf_auth có quyền trên bảng xác thực kèm policy in_auth_context() → không vi phạm', async () => {
    expect(await run({})).toEqual([]);
  });

  it('cf_auth có quyền trên bảng nghiệp vụ (core.members) → đỏ', async () => {
    const v = await run({ priv: [authPriv('core.members', { can_select: true })] });
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.members',
        message: expect.stringContaining('chỉ được truy cập bảng xác thực'),
      }),
    );
  });

  it('cf_auth có quyền nhưng policy của nó mở toang (USING true) hoặc thiếu in_auth_context() → đỏ', async () => {
    for (const expr of ['true', '(user_id IS NOT NULL)']) {
      const v = await run({ policies: [authPolicy({ qual: expr, withcheck: expr })] });
      expect(v, expr).toContainEqual(
        expect.objectContaining({
          subject: S,
          message: expect.stringContaining('cf_auth có quyền'),
        }),
      );
    }
  });

  it('cf_auth có quyền nhưng không policy nào áp cho cf_auth → đỏ', async () => {
    const v = await run({ policies: [authPolicy({ applies_to_auth: false })] });
    expect(v).toContainEqual(
      expect.objectContaining({ subject: S, message: expect.stringContaining('cf_auth có quyền') }),
    );
  });

  it('cf_auth có TRUNCATE trên bảng xác thực → đỏ', async () => {
    const v = await run({ priv: [authPriv(S, { can_select: true, can_truncate: true })] });
    expect(v).toContainEqual(
      expect.objectContaining({ subject: S, message: expect.stringContaining('TRUNCATE') }),
    );
  });

  it('cf_auth không tồn tại hoặc có BYPASSRLS / là thành viên cf_owner → đỏ', async () => {
    expect(await run({ authRole: null })).toContainEqual({
      subject: 'cf_auth',
      message: 'role không tồn tại',
    });
    const flags = {
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    };
    expect(await run({ authRole: { ...flags, rolbypassrls: true } })).toContainEqual({
      subject: 'cf_auth',
      message: 'có BYPASSRLS',
    });
    expect(await run({ authRole: { ...flags, owner_member: true } })).toContainEqual(
      expect.objectContaining({ subject: 'cf_auth', message: expect.stringContaining('cf_owner') }),
    );
  });
});

describe('checkRls — kiểm chứng sau 0010', () => {
  const S = 'core.sessions';
  const none = { can_select: false, can_insert: false, can_update: false, can_delete: false };
  const authPriv = {
    name: S,
    ...none,
    can_select: true,
    can_truncate: false,
    can_trigger: false,
    can_references: false,
  };
  const policyWith = (expr: string) => ({
    name: S,
    polname: 'sessions_auth_access',
    polcmd: 'r',
    permissive: true,
    applies_to_app: false,
    applies_to_auth: true,
    qual: expr,
    withcheck: null,
  });
  const run = (expr: string) =>
    checkRls(
      fakeDb({
        tables: [table(S)],
        privileges: [grant(S, none)],
        authPrivileges: [authPriv],
        policies: [policyWith(expr)],
      }),
    );

  it('policy cf_auth chỉ đạt khi biểu thức CHÍNH XÁC là in_auth_context(); OR/NOT/AND thêm → đỏ', async () => {
    expect(await run(AUTH_ONLY)).toEqual([]);
    for (const expr of [
      `(${AUTH_ONLY} OR (id IS NOT NULL))`,
      `(NOT ${AUTH_ONLY})`,
      `(${AUTH_ONLY} AND (user_id IS NOT NULL))`,
    ]) {
      expect(await run(expr), expr).toContainEqual(
        expect.objectContaining({
          subject: S,
          message: expect.stringContaining('cf_auth có quyền'),
        }),
      );
    }
  });

  it('cf_auth làm chủ bảng → đỏ', async () => {
    const v = await checkRls(fakeDb({ ...base, tables: [table(M, { owner: 'cf_auth' })] }));
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: M,
        message: expect.stringContaining('cf_auth không được sở hữu'),
      }),
    );
  });

  it('quyền theo cột nhạy cảm (cf_app đọc sessions.token, cf_auth sửa users.is_admin) → đỏ', async () => {
    const v = await checkRls(
      fakeDb({
        ...base,
        sensitive: [
          { role: 'cf_app', tbl: 'core.sessions', col: 'token', priv: 'SELECT' },
          { role: 'cf_auth', tbl: 'core.users', col: 'is_admin', priv: 'UPDATE' },
        ],
      }),
    );
    expect(v).toContainEqual({
      subject: 'core.sessions',
      message: 'cf_app không được có quyền SELECT trên cột token',
    });
    expect(v).toContainEqual({
      subject: 'core.users',
      message: 'cf_auth không được có quyền UPDATE trên cột is_admin',
    });
  });
});

describe('checkRls — danh sách cho phép cột users và chốt chặn tạo Admin', () => {
  it('cf_app đọc cột users ngoài 7 cột cho phép (phone) → đỏ; đúng 7 cột → đạt', async () => {
    const seven = ['id', 'email', 'name', 'image', 'locale', 'created_at', 'updated_at'].map(
      (col) => ({ col }),
    );
    expect(await checkRls(fakeDb({ ...base, usersColumns: seven }))).toEqual([]);
    const v = await checkRls(fakeDb({ ...base, usersColumns: [...seven, { col: 'phone' }] }));
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.users',
        message: expect.stringContaining('cột phone'),
      }),
    );
  });

  it('thiếu policy RESTRICTIVE chặn cf_auth tạo Admin, hoặc điều kiện không nhắc is_admin/admin_role → đỏ', async () => {
    for (const adminGuard of [
      [],
      [{ polname: 'x', withcheck: '(true)' }],
      [{ polname: 'x', withcheck: '(NOT is_admin)' }],
    ]) {
      const v = await checkRls(fakeDb({ ...base, adminGuard }));
      expect(v, JSON.stringify(adminGuard)).toContainEqual(
        expect.objectContaining({
          subject: 'core.users',
          message: expect.stringContaining('thiếu policy RESTRICTIVE'),
        }),
      );
    }
  });
});
