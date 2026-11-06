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
  workerRole?: Row | null;
  workerMembership?: Row[];
  workerDirect?: Row[];
  authPrivileges?: Row[];
  definerFunctions?: Row[];
  lastOwnerTrigger?: Row[];
  actorPolicies?: Row[];
  actorForbidden?: Row[];
  noDelete?: Row[];
  tokenFunctions?: Row[];
  webhookFn?: Row[];
  stuckOutboxFn?: Row[];
  usageFn?: Row[];
  invoiceTables?: Row[];
  paymentsPii?: Row[];
  invoiceFn?: Row[];
  leaveFn?: Row[];
  actionLogsCheck?: Row[];
  guards?: Row[];
  systemFn?: Row[];
  channelInsert?: Row[];
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
      if (text.includes('/* worker-role */')) {
        const ok = {
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        };
        return { rows: parts.workerRole === null ? [] : [parts.workerRole ?? ok] };
      }
      if (text.includes('/* worker-create-privileges */')) return { rows: [noCreate] };
      if (text.includes('/* worker-membership */')) return { rows: parts.workerMembership ?? [] };
      if (text.includes('/* worker-direct-privileges */'))
        return { rows: parts.workerDirect ?? [] };
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
      if (text.includes('/* definer-functions */')) return { rows: parts.definerFunctions ?? [] };
      if (text.includes('/* column-guard-triggers */')) return { rows: parts.guards ?? [] };
      if (text.includes('/* is-system-context-body */')) return { rows: parts.systemFn ?? [] };
      if (text.includes('/* channels-no-insert */')) return { rows: parts.channelInsert ?? [] };
      if (text.includes('/* webhook-function */')) return { rows: parts.webhookFn ?? [] };
      if (text.includes('/* stuck-outbox-function */')) return { rows: parts.stuckOutboxFn ?? [] };
      if (text.includes('/* usage-function */')) return { rows: parts.usageFn ?? [] };
      if (text.includes('/* invoice-tables */')) return { rows: parts.invoiceTables ?? [] };
      if (text.includes('/* payments-pii-columns */')) return { rows: parts.paymentsPii ?? [] };
      if (text.includes('/* invoice-functions */')) return { rows: parts.invoiceFn ?? [] };
      if (text.includes('/* action-logs-check */')) return { rows: parts.actionLogsCheck ?? [] };
      if (text.includes('/* leave-function */')) return { rows: parts.leaveFn ?? [] };
      if (text.includes('/* token-functions */')) return { rows: parts.tokenFunctions ?? [] };
      if (text.includes('/* no-delete */')) return { rows: parts.noDelete ?? [] };
      if (text.includes('/* actor-forbidden */')) return { rows: parts.actorForbidden ?? [] };
      if (text.includes('/* actor-policies */')) return { rows: parts.actorPolicies ?? [] };
      if (text.includes('/* last-owner-trigger */')) return { rows: parts.lastOwnerTrigger ?? [] };
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
      [{ polname: 'x', withcheck: '(NOT (is_admin AND (admin_role IS NULL)))' }],
      // Chỉ nhắc tên cột nhưng không phải điều kiện chặn → đỏ (so khớp chính xác, không regex)
      [{ polname: 'x', withcheck: '((NOT is_admin) OR (admin_role IS NULL))' }],
      [{ polname: 'x', withcheck: '((is_admin OR true) AND (admin_role IS NOT NULL))' }],
      [{ polname: 'x', withcheck: '((NOT is_admin) AND (admin_role IS NULL) OR true)' }],
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

describe('checkRls: hàm SECURITY DEFINER và trigger Owner cuối', () => {
  it('báo hàm DEFINER thiếu search_path cố định và trigger Owner cuối bị mất', async () => {
    const v = await checkRls(
      fakeDb({
        definerFunctions: [
          { name: 'core.accept_invitation', problem: 'thiếu search_path cố định' },
        ],
        lastOwnerTrigger: [{ name: 'core.members' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'core.accept_invitation',
      message: 'hàm SECURITY DEFINER không an toàn: thiếu search_path cố định',
    });
    expect(v.map((x) => x.message).join('\n')).toContain('members_guard_last_owner');
  });
});

describe('checkRls: policy người gọi (chỉ-Owner)', () => {
  it('báo khi thiếu policy chỉ-Owner', async () => {
    const v = await checkRls(
      fakeDb({ actorPolicies: [{ tbl: 'core.members', cmd: 'a', marker: 'is_workspace_owner' }] }),
    );
    expect(v).toContainEqual({
      subject: 'core.members',
      message: expect.stringContaining('policy "người gọi" (is_workspace_owner)'),
    });
  });
});

describe('checkRls: hàm tự rời workspace và policy đọc nhật ký', () => {
  it('báo khi hàm tự rời thiếu/mở rộng quyền', async () => {
    const v = await checkRls(
      fakeDb({
        leaveFn: [{ name: 'core.leave_workspace', problem: 'PUBLIC có quyền EXECUTE' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'core.leave_workspace',
      message: 'hàm tự rời: PUBLIC có quyền EXECUTE',
    });
  });

  it('báo khi policy đọc action_logs không phân Owner/Staff', async () => {
    const v = await checkRls(
      fakeDb({
        actorPolicies: [{ tbl: 'core.action_logs', cmd: 'r', marker: 'is_workspace_owner' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'core.action_logs',
      message: expect.stringContaining(`policy "người gọi" (is_workspace_owner) cho lệnh 'r'`),
    });
  });
});

describe('checkRls: on_behalf_of của action_logs (0029)', () => {
  it('báo khi policy SELECT/INSERT của action_logs thiếu marker on_behalf_of', async () => {
    // Hàng của fake = các cặp VI PHẠM (thiếu marker).
    const missing = [
      { tbl: 'core.action_logs', cmd: 'r', marker: 'on_behalf_of' },
      { tbl: 'core.action_logs', cmd: 'a', marker: 'on_behalf_of' },
      { tbl: 'core.action_logs', cmd: 'a', marker: 'is_system_context' },
    ];
    const v = await checkRls(fakeDb({ actorPolicies: missing }));
    const messages = v.filter((x) => x.subject === 'core.action_logs').map((x) => x.message);
    expect(messages).toContainEqual(expect.stringContaining(`(on_behalf_of) cho lệnh 'r'`));
    expect(messages).toContainEqual(expect.stringContaining(`(on_behalf_of) cho lệnh 'a'`));
    expect(messages).toContainEqual(expect.stringContaining(`(is_system_context) cho lệnh 'a'`));
  });

  it('báo khi thiếu CHECK action_logs_on_behalf_of_check hoặc sai định nghĩa', async () => {
    const v = await checkRls(
      fakeDb({
        actionLogsCheck: [
          { name: 'core.action_logs', problem: 'thiếu CHECK action_logs_on_behalf_of_check' },
        ],
      }),
    );
    expect(v).toContainEqual({
      subject: 'core.action_logs',
      message: 'thiếu CHECK action_logs_on_behalf_of_check',
    });
  });
});

describe('checkRls: bảng không được DELETE', () => {
  it('báo khi cf_app có quyền DELETE trên bảng cấm', async () => {
    const v = await checkRls(fakeDb({ noDelete: [{ tbl: 'cf.comments' }] }));
    expect(v).toContainEqual({
      subject: 'cf.comments',
      message: expect.stringContaining('không được có quyền DELETE'),
    });
  });
});

describe('checkRls: hàm token Page', () => {
  it('báo khi hàm token thiếu/mở rộng quyền', async () => {
    const v = await checkRls(
      fakeDb({
        tokenFunctions: [{ name: 'read_channel_token', problem: 'PUBLIC có quyền EXECUTE' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'cf.read_channel_token',
      message: expect.stringContaining('PUBLIC có quyền EXECUTE'),
    });
  });
});

describe('checkRls: role worker cf_worker (WORKER-DB-ROLE, 0030)', () => {
  it('báo khi role cf_worker không tồn tại, là superuser hoặc có BYPASSRLS', async () => {
    const missing = await checkRls(fakeDb({ workerRole: null }));
    expect(missing).toContainEqual({ subject: 'cf_worker', message: 'role không tồn tại' });
    const bad = await checkRls(
      fakeDb({
        workerRole: {
          rolsuper: true,
          rolbypassrls: true,
          rolcreatedb: false,
          rolcreaterole: false,
        },
      }),
    );
    expect(bad).toContainEqual({ subject: 'cf_worker', message: 'là superuser' });
    expect(bad).toContainEqual({ subject: 'cf_worker', message: 'có BYPASSRLS' });
  });

  it('báo khi cf_worker là thành viên cf_owner (test tích hợp không dựng được: cf_owner không có ADMIN option)', async () => {
    const v = await checkRls(
      fakeDb({
        workerRole: {
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
          owner_member: true,
        },
      }),
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf_worker',
        message: expect.stringContaining('cf_owner'),
      }),
    );
  });

  it('báo khi cf_app là thành viên cf_worker hoặc cf_worker không kế thừa cf_app', async () => {
    const v = await checkRls(
      fakeDb({
        workerMembership: [
          {
            name: 'cf_worker',
            problem: 'cf_app là thành viên cf_worker (web nâng quyền thành worker được)',
          },
        ],
      }),
    );
    expect(v).toContainEqual({
      subject: 'cf_worker',
      message: expect.stringContaining('web nâng quyền'),
    });
  });

  it('báo quyền TRỰC TIẾP của cf_worker trên bảng/cột/sequence/hàm ngoài read_channel_token', async () => {
    const v = await checkRls(
      fakeDb({
        workerDirect: [
          { name: 'cf.channels', problem: 'có quyền SELECT trực tiếp trên bảng/sequence' },
        ],
      }),
    );
    expect(v).toContainEqual({
      subject: 'cf.channels',
      message: expect.stringContaining('cf_worker không được có quyền trực tiếp'),
    });
  });

  it('SQL quyền trực tiếp quét bảng, cột, sequence và hàm; thân is_system_context so OR không phân biệt hoa thường', async () => {
    const queries: string[] = [];
    const base = fakeDb({});
    await checkRls({
      query: async (text) => {
        queries.push(text);
        return base.query(text);
      },
    });
    const direct = queries.find((q) => q.includes('/* worker-direct-privileges */')) ?? '';
    expect(direct).toContain('relacl');
    expect(direct).toContain('attacl');
    expect(direct).toContain('proacl');
    expect(direct).toContain('read_channel_token');
    const system = queries.find((q) => q.includes('/* is-system-context-body */')) ?? '';
    expect(system).toContain("NOT ILIKE '% OR %'");
  });

  it('SQL kiểm thân is_system_context đòi session_user và cf_worker; read_channel_token chặn cf_app', async () => {
    const queries: string[] = [];
    const base = fakeDb({});
    await checkRls({
      query: async (text) => {
        queries.push(text);
        return base.query(text);
      },
    });
    const system = queries.find((q) => q.includes('/* is-system-context-body */')) ?? '';
    expect(system).toContain('session_user');
    expect(system).toContain('cf_worker');
    const token = queries.find((q) => q.includes('/* token-functions */')) ?? '';
    expect(token).toMatch(
      /has_function_privilege\('cf_app', p\.oid, 'EXECUTE'\)\s+OR NOT has_function_privilege\('cf_worker'/,
    );
  });
});

describe('checkRls: trigger giới hạn cột, thân is_system_context, INSERT kênh', () => {
  it('báo từng loại vi phạm', async () => {
    const v = await checkRls(
      fakeDb({
        guards: [{ name: 'cf.comments', trg: 'comments_guard_user_update' }],
        systemFn: [{ name: 'core.is_system_context' }],
        channelInsert: [{ name: 'cf.channels' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'cf.comments',
      message: expect.stringContaining('comments_guard_user_update'),
    });
    expect(v).toContainEqual({
      subject: 'core.is_system_context',
      message: expect.stringContaining("app.ctx = 'system'"),
    });
    expect(v).toContainEqual({
      subject: 'cf.channels',
      message: expect.stringContaining('INSERT'),
    });
  });
});

describe('checkRls: hàm liệt kê yêu cầu gửi/ẩn kẹt (SEND-SWEEP/HIDE-SWEEP)', () => {
  it('báo khi hàm thiếu, mở cho cf_app/PUBLIC hoặc bỏ kiểm ngữ cảnh', async () => {
    const v = await checkRls(
      fakeDb({
        stuckOutboxFn: [{ name: 'cf.list_stuck_outbox', problem: 'cf_app (web) có EXECUTE' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'cf.list_stuck_outbox',
      message: expect.stringContaining('cf_app (web) có EXECUTE'),
    });
  });

  it('SQL đòi SECURITY DEFINER, chặn PUBLIC/cf_app/cf_auth, cấp cf_worker và kiểm thân (ngữ cảnh trần + session_user)', async () => {
    const queries: string[] = [];
    const base = fakeDb({});
    await checkRls({
      query: async (text) => {
        queries.push(text);
        return base.query(text);
      },
    });
    const sqlText = queries.find((q) => q.includes('/* stuck-outbox-function */')) ?? '';
    expect(sqlText).toContain('prosecdef');
    expect(sqlText).toContain("has_function_privilege('public'");
    expect(sqlText).toContain("has_function_privilege('cf_app'");
    expect(sqlText).toContain("has_function_privilege('cf_worker'");
    expect(sqlText).toContain('is_system_context() IS NOT FALSE');
    expect(sqlText).toContain("session_user <> ''cf_worker''");
    // cf_worker được EXECUTE trực tiếp ĐÚNG hai hàm này (không hàm nào khác).
    const direct = queries.find((q) => q.includes('/* worker-direct-privileges */')) ?? '';
    expect(direct).toContain("'read_channel_token', 'list_stuck_outbox'");
  });
});

describe('checkRls: hàm trừ lượt AI (USAGE-COUNTERS, FR-090)', () => {
  it('FR-090 báo khi hàm thiếu, mở cho cf_app/PUBLIC hoặc bỏ kiểm ngữ cảnh', async () => {
    const v = await checkRls(
      fakeDb({ usageFn: [{ name: 'core.consume_usage', problem: 'cf_app (web) có EXECUTE' }] }),
    );
    expect(v).toContainEqual({
      subject: 'core.consume_usage',
      message: expect.stringContaining('cf_app (web) có EXECUTE'),
    });
  });

  it('FR-090 SQL đòi DEFINER, chặn PUBLIC/cf_app/cf_auth, cấp cf_worker và kiểm thân hàm; worker được EXECUTE hàm này', async () => {
    const queries: string[] = [];
    const base = fakeDb({});
    await checkRls({
      query: async (text) => {
        queries.push(text);
        return base.query(text);
      },
    });
    const sqlText = queries.find((q) => q.includes('/* usage-function */')) ?? '';
    expect(sqlText).toContain('prosecdef');
    expect(sqlText).toContain("has_function_privilege('public'");
    expect(sqlText).toContain("has_function_privilege('cf_app'");
    expect(sqlText).toContain("has_function_privilege('cf_auth'");
    expect(sqlText).toContain("has_function_privilege('cf_worker'");
    expect(sqlText).toContain('is_system_context() IS NOT TRUE');
    expect(sqlText).toContain('current_workspace_id() IS DISTINCT FROM p_workspace_id');
    expect(sqlText).toContain("session_user <> ''cf_worker''");
    const direct = queries.find((q) => q.includes('/* worker-direct-privileges */')) ?? '';
    expect(direct).toContain("p.proname = 'consume_usage'");
  });
});

describe('checkRls: hóa đơn/thanh toán (INVOICES, FR-091)', () => {
  it('báo bảng cf_app ghi được, cột PII đọc được và hàm hóa đơn mở quyền', async () => {
    const v = await checkRls(
      fakeDb({
        invoiceTables: [{ name: 'core.invoices', problem: 'cf_app không được có quyền ghi' }],
        paymentsPii: [{ name: 'raw_statement' }],
        invoiceFn: [{ name: 'core.create_invoice', problem: 'PUBLIC có quyền EXECUTE' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'core.invoices',
      message: expect.stringContaining('cf_app không được có quyền ghi'),
    });
    expect(v).toContainEqual({
      subject: 'core.payments.raw_statement',
      message: expect.stringContaining('PII'),
    });
    expect(v).toContainEqual({
      subject: 'core.create_invoice',
      message: expect.stringContaining('PUBLIC có quyền EXECUTE'),
    });
  });
});

describe('checkRls: hàm ghi sự kiện webhook', () => {
  it('báo khi hàm thiếu/mở rộng ngữ cảnh', async () => {
    const v = await checkRls(
      fakeDb({
        webhookFn: [{ name: 'cf.record_webhook_event', problem: 'PUBLIC có quyền EXECUTE' }],
      }),
    );
    expect(v).toContainEqual({
      subject: 'cf.record_webhook_event',
      message: expect.stringContaining('PUBLIC có quyền EXECUTE'),
    });
  });
});
