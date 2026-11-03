/** Kiểm cấu hình RLS của schema core/cf (docs/10 §4, docs/13 §4). Dùng bởi CLI và CI. */

export type Queryable = {
  query: (text: string) => Promise<{ rows: Record<string, unknown>[] }>;
};
export type RlsViolation = { subject: string; message: string };

const APP_ROLE = 'cf_app';
/** Role riêng của adapter Better Auth: chỉ chạm các bảng xác thực, và chỉ trong ngữ cảnh app.ctx = 'auth'. */
const AUTH_ROLE = 'cf_auth';

/** Bảng hệ thống KHÔNG có RLS (cờ tính năng; chỉ SELECT cho cf_app). */
const SYSTEM_TABLES = ['core.feature_flags'];
/** Bảng không có workspace_id nhưng khóa chính chính là định danh workspace. */
const RLS_BY_OWN_ID_TABLES = ['core.workspaces'];
/** Bảng "của chính mình" với cf_app: policy chỉ cho dòng có user_id/id = current_user_id() (không workspace). */
const OWN_USER_TABLES = ['core.users', 'core.sessions', 'core.accounts'];
/** Bảng cf_app KHÔNG được có quyền nào (chỉ cf_auth). */
// two_factors chứa secret TOTP và mã dự phòng: cf_app không được chạm (cf_auth cấp riêng khi tạo bảng).
const AUTH_ONLY_TABLES = ['core.verifications', 'core.two_factors'];
/** Mọi bảng xác thực: cf_auth chỉ được chạm các bảng này. */
const AUTH_TABLES = [...OWN_USER_TABLES, ...AUTH_ONLY_TABLES];

type Command = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
const POLICY_LETTER: Record<Command, string> = {
  SELECT: 'r',
  INSERT: 'a',
  UPDATE: 'w',
  DELETE: 'd',
};

/** Một nhóm bảng RLS: mẫu biểu thức chuẩn mà MỌI policy permissive áp cho cf_app phải thỏa. */
type PolicyClass = { label: string; isScoped: (expr: unknown) => boolean };

// pg_get_expr in biểu thức dạng "(workspace_id = ( SELECT core.current_workspace_id() AS current_workspace_id))".
const WORKSPACE_SHAPE = /\b(workspace_id|id)\s*=\s*\(\s*SELECT\s+core\.current_workspace_id\(\)/i;
const AUTH_SHAPE = /core\.in_auth_context\(\)/i;
// Nhánh "của mình": (user_id|id) = ( SELECT core.current_user_id() ...) VÀ ( SELECT core.current_workspace_id() ...) IS NULL.
const OWN_ROW_SHAPE = /\b(user_id|id)\s*=\s*\(\s*SELECT\s+core\.current_user_id\(\)/i;
const NO_WORKSPACE_SHAPE = /core\.current_workspace_id\(\)(\s+AS\s+\w+)?\)\s+IS\s+NULL/i;
/** Biểu thức CHỈ gồm `( SELECT core.in_auth_context() [AS ...])` — không cho OR/NOT/AND thêm gì khác. */
const isExactAuthContext = (expr: string): boolean =>
  /^\(*selectcore\.in_auth_context\(\)(asin_auth_context)?\)*$/.test(
    expr.replace(/\s+/g, '').toLowerCase(),
  );
/** Chặn các biểu thức mở toang (`true`, `1 = 1`, `NOT false`, `... OR true`). */
const hasTrueLiteral = (expr: string): boolean =>
  /\btrue\b|\b1\s*=\s*1\b|\bnot\s+false\b/i.test(expr);

const workspaceClass: PolicyClass = {
  label: 'current_workspace_id()',
  isScoped: (expr) =>
    typeof expr === 'string' && WORKSPACE_SHAPE.test(expr) && !hasTrueLiteral(expr),
};
const ownUserClass: PolicyClass = {
  label: '(không workspace, user_id/id = current_user_id()) và KHÔNG dựa vào in_auth_context()',
  isScoped: (expr) =>
    typeof expr === 'string' &&
    !AUTH_SHAPE.test(expr) &&
    OWN_ROW_SHAPE.test(expr) &&
    NO_WORKSPACE_SHAPE.test(expr) &&
    !hasTrueLiteral(expr),
};
// Bảng chỉ cf_auth: mọi policy áp cho cf_app đều sai (cf_app không được có quyền nào, kiểm ở dưới).
const authOnlyClass: PolicyClass = {
  label: 'không có quyền nào cho cf_app',
  isScoped: () => false,
};

function classify(name: string, hasWorkspaceId: boolean): PolicyClass | 'system' | 'unknown' {
  if (hasWorkspaceId || RLS_BY_OWN_ID_TABLES.includes(name)) return workspaceClass;
  if (OWN_USER_TABLES.includes(name)) return ownUserClass;
  if (AUTH_ONLY_TABLES.includes(name)) return authOnlyClass;
  if (SYSTEM_TABLES.includes(name)) return 'system';
  return 'unknown';
}

/** Thuộc tính nguy hiểm + quyền CREATE + tư cách thành viên role chủ sở hữu của một role ứng dụng. */
async function checkRole(
  db: Queryable,
  roleName: string,
  tagPrefix: string,
  violations: RlsViolation[],
): Promise<void> {
  const role = await db.query(`/* ${tagPrefix}role */
    SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
           EXISTS (SELECT 1 FROM pg_roles o WHERE o.rolname <> '${roleName}'
                   AND o.rolname IN ('cf_owner', 'postgres') AND pg_has_role('${roleName}', o.oid, 'MEMBER')) AS owner_member
    FROM pg_roles WHERE rolname = '${roleName}'`);
  const found = role.rows[0];
  if (!found) {
    violations.push({ subject: roleName, message: 'role không tồn tại' });
    return;
  }
  if (found.rolsuper === true) violations.push({ subject: roleName, message: 'là superuser' });
  if (found.rolbypassrls === true) violations.push({ subject: roleName, message: 'có BYPASSRLS' });
  if (found.rolcreatedb === true)
    violations.push({ subject: roleName, message: 'có quyền CREATEDB' });
  if (found.rolcreaterole === true)
    violations.push({ subject: roleName, message: 'có quyền CREATEROLE' });
  if (found.owner_member === true) {
    violations.push({ subject: roleName, message: 'là thành viên của role chủ sở hữu (cf_owner)' });
  }

  // Không được tạo đối tượng trong schema ứng dụng hoặc trong database.
  const create = await db.query(`/* ${tagPrefix}create-privileges */
    SELECT has_schema_privilege('${roleName}', 'core', 'CREATE') AS core_create,
           has_schema_privilege('${roleName}', 'cf', 'CREATE') AS cf_create,
           has_schema_privilege('${roleName}', 'public', 'CREATE') AS public_create,
           has_database_privilege('${roleName}', current_database(), 'CREATE') AS db_create`);
  const grants = create.rows[0] ?? {};
  for (const [key, label] of [
    ['core_create', 'schema core'],
    ['cf_create', 'schema cf'],
    ['public_create', 'schema public'],
    ['db_create', 'database'],
  ] as const) {
    if (grants[key] === true) {
      violations.push({ subject: roleName, message: `có quyền CREATE trên ${label}` });
    }
  }
}

/**
 * cf_auth chỉ được chạm bảng xác thực; mọi quyền có trên bảng xác thực phải được một policy áp cho cf_auth
 * kèm điều kiện in_auth_context() (role + ngữ cảnh: thiếu một trong hai là không vào được).
 */
async function checkAuthRolePrivileges(
  db: Queryable,
  policyRows: Record<string, unknown>[],
  violations: RlsViolation[],
): Promise<void> {
  const privileges = await db.query(`/* auth-privileges */
    SELECT n.nspname || '.' || c.relname AS name,
           has_any_column_privilege('${AUTH_ROLE}', c.oid, 'SELECT') AS can_select,
           has_any_column_privilege('${AUTH_ROLE}', c.oid, 'INSERT') AS can_insert,
           has_any_column_privilege('${AUTH_ROLE}', c.oid, 'UPDATE') AS can_update,
           has_table_privilege('${AUTH_ROLE}', c.oid, 'DELETE') AS can_delete,
           has_table_privilege('${AUTH_ROLE}', c.oid, 'TRUNCATE') AS can_truncate,
           has_table_privilege('${AUTH_ROLE}', c.oid, 'TRIGGER') AS can_trigger,
           has_table_privilege('${AUTH_ROLE}', c.oid, 'REFERENCES') AS can_references
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('core', 'cf')`);
  for (const row of privileges.rows) {
    const name = String(row.name);
    const hasAny =
      row.can_select === true ||
      row.can_insert === true ||
      row.can_update === true ||
      row.can_delete === true;
    if (!AUTH_TABLES.includes(name)) {
      if (
        hasAny ||
        row.can_truncate === true ||
        row.can_trigger === true ||
        row.can_references === true
      ) {
        violations.push({
          subject: name,
          message: `${AUTH_ROLE} chỉ được truy cập bảng xác thực (đang có quyền trên bảng này)`,
        });
      }
      continue;
    }
    for (const [key, label] of [
      ['can_truncate', 'TRUNCATE'],
      ['can_trigger', 'TRIGGER'],
      ['can_references', 'REFERENCES'],
    ] as const) {
      if (row[key] === true) {
        violations.push({ subject: name, message: `${AUTH_ROLE} không được có quyền ${label}` });
      }
    }
    const granted: Record<Command, boolean> = {
      SELECT: row.can_select === true,
      INSERT: row.can_insert === true,
      UPDATE: row.can_update === true,
      DELETE: row.can_delete === true,
    };
    for (const command of Object.keys(granted) as Command[]) {
      if (!granted[command]) continue;
      const relevant = policyRows.filter(
        (p) =>
          String(p.name) === name &&
          p.permissive === true &&
          p.applies_to_auth === true &&
          (String(p.polcmd) === POLICY_LETTER[command] || String(p.polcmd) === '*'),
      );
      const ok =
        relevant.length > 0 &&
        relevant.every((p) => {
          const using = typeof p.qual === 'string' ? p.qual : null;
          const check = typeof p.withcheck === 'string' ? p.withcheck : null;
          const needsCheck = command === 'INSERT' || command === 'UPDATE';
          const exprOk = (e: string | null) => e !== null && isExactAuthContext(e);
          if (command === 'INSERT') return exprOk(check);
          return exprOk(using) && (!needsCheck || check === null || exprOk(check));
        });
      if (!ok) {
        violations.push({
          subject: name,
          message: `${AUTH_ROLE} có quyền ${command} nhưng không có policy ${command} dựa vào in_auth_context() (hoặc policy mở quá rộng)`,
        });
      }
    }
  }
}

/** Quyền theo cột KHÔNG được có (has_column_privilege tính cả quyền cấp mức bảng). */
const FORBIDDEN_COLUMN_PRIVILEGES: Array<
  [role: string, table: string, column: string, priv: string]
> = [
  // cf_app không đọc bí mật xác thực dù là của chính mình
  ['cf_app', 'core.sessions', 'token', 'SELECT'],
  ['cf_app', 'core.accounts', 'password', 'SELECT'],
  ['cf_app', 'core.accounts', 'access_token', 'SELECT'],
  ['cf_app', 'core.accounts', 'refresh_token', 'SELECT'],
  ['cf_app', 'core.accounts', 'id_token', 'SELECT'],
  // cf_app không đọc trạng thái nhạy cảm của users (lấy từ phiên Better Auth phía server)
  ['cf_app', 'core.users', 'is_admin', 'SELECT'],
  ['cf_app', 'core.users', 'admin_role', 'SELECT'],
  ['cf_app', 'core.users', 'email_verified', 'SELECT'],
  ['cf_app', 'core.users', 'totp_enabled', 'SELECT'],
  // cf_app chỉ ghi users.name/image/locale/updated_at; không ghi/chèn phiên, tài khoản
  ['cf_app', 'core.users', 'email', 'UPDATE'],
  ['cf_app', 'core.users', 'email_verified', 'UPDATE'],
  ['cf_app', 'core.users', 'totp_enabled', 'UPDATE'],
  ['cf_app', 'core.users', 'is_admin', 'UPDATE'],
  ['cf_app', 'core.users', 'admin_role', 'UPDATE'],
  ['cf_app', 'core.users', 'email', 'INSERT'],
  ['cf_app', 'core.accounts', 'password', 'UPDATE'],
  ['cf_app', 'core.sessions', 'is_admin_session', 'UPDATE'],
  ['cf_app', 'core.sessions', 'created_at', 'UPDATE'],
  ['cf_app', 'core.sessions', 'expires_at', 'UPDATE'],
  // cf_auth không đổi quyền Admin và không sửa mốc/khóa của phiên
  ['cf_auth', 'core.users', 'is_admin', 'UPDATE'],
  ['cf_auth', 'core.users', 'admin_role', 'UPDATE'],
  ['cf_auth', 'core.sessions', 'is_admin_session', 'UPDATE'],
  ['cf_auth', 'core.sessions', 'created_at', 'UPDATE'],
  ['cf_auth', 'core.sessions', 'user_id', 'UPDATE'],
  ['cf_auth', 'core.sessions', 'token', 'UPDATE'],
  // cf_auth không chuyển secret TOTP sang người khác
  ['cf_auth', 'core.two_factors', 'user_id', 'UPDATE'],
];

/** Cột của core.users mà cf_app được SELECT (migration 0012) — danh sách cho phép, không phải danh sách cấm. */
const USERS_COLUMNS_FOR_APP = [
  'id',
  'email',
  'name',
  'image',
  'locale',
  'created_at',
  'updated_at',
] as const;

/** cf_app chỉ đọc đúng 7 cột của users: cột mới thêm sau này (phone, deleted_at...) mặc định không được lộ. */
async function checkUsersColumnAllowlist(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const found = await db.query(`/* users-columns */
    SELECT a.attname AS col
    FROM pg_attribute a
    WHERE a.attrelid = 'core.users'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}')
               THEN has_column_privilege('${APP_ROLE}', a.attrelid, a.attnum, 'SELECT') ELSE false END`);
  const allowed: readonly string[] = USERS_COLUMNS_FOR_APP;
  for (const row of found.rows) {
    const column = String(row.col);
    if (!allowed.includes(column)) {
      violations.push({
        subject: 'core.users',
        message: `${APP_ROLE} đọc được cột ${column} ngoài danh sách cho phép (${USERS_COLUMNS_FOR_APP.join(', ')})`,
      });
    }
  }
}

/**
 * cf_auth có INSERT mức bảng trên core.users nên chốt duy nhất chặn nó tạo Admin là policy RESTRICTIVE
 * (migration 0011): phải còn tồn tại, áp cho INSERT/ALL, và điều kiện nhắc is_admin lẫn admin_role.
 */
async function checkAdminInsertGuard(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const found = await db.query(`/* admin-insert-guard */
    SELECT p.polname, pg_get_expr(p.polwithcheck, p.polrelid) AS withcheck
    FROM pg_policy p
    WHERE p.polrelid = 'core.users'::regclass AND NOT p.polpermissive AND p.polcmd IN ('a', '*')
      AND (0 = ANY(p.polroles)
           OR EXISTS (SELECT 1 FROM unnest(p.polroles) AS rid
                      WHERE rid <> 0 AND pg_has_role('${AUTH_ROLE}', rid, 'MEMBER')))`);
  const guarded = found.rows.some(
    (row) =>
      typeof row.withcheck === 'string' &&
      /\bis_admin\b/.test(row.withcheck) &&
      /\badmin_role\b/.test(row.withcheck),
  );
  if (!guarded) {
    violations.push({
      subject: 'core.users',
      message: `thiếu policy RESTRICTIVE chặn ${AUTH_ROLE} INSERT người dùng Admin (is_admin / admin_role)`,
    });
  }
}

async function checkSensitiveColumns(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const values = FORBIDDEN_COLUMN_PRIVILEGES.map(
    ([role, table, column, priv]) => `('${role}', '${table}', '${column}', '${priv}')`,
  ).join(', ');
  const found = await db.query(`/* sensitive-columns */
    SELECT v.r AS role, v.t AS tbl, v.c AS col, v.p AS priv
    FROM (VALUES ${values}) AS v(r, t, c, p)
    WHERE CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v.r)
               THEN has_column_privilege(v.r, v.t, v.c, v.p) ELSE false END`);
  for (const row of found.rows) {
    violations.push({
      subject: String(row.tbl),
      message: `${String(row.role)} không được có quyền ${String(row.priv)} trên cột ${String(row.col)}`,
    });
  }
}

export async function checkRls(db: Queryable): Promise<RlsViolation[]> {
  const violations: RlsViolation[] = [];

  // --- Bảng: RLS bật + có policy (thẻ /* ... */ để DB giả trong test nhận ra) ---
  const tables = await db.query(`/* tables */
    SELECT n.nspname || '.' || c.relname AS name,
           c.relrowsecurity AS rls,
           pg_get_userbyid(c.relowner) AS owner,
           EXISTS (SELECT 1 FROM pg_attribute a
                   WHERE a.attrelid = c.oid AND a.attname = 'workspace_id' AND NOT a.attisdropped) AS has_workspace_id,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('core', 'cf')
    ORDER BY 1`);

  const rlsTables = new Map<string, PolicyClass>();
  for (const row of tables.rows) {
    const name = String(row.name);
    const klass = classify(name, row.has_workspace_id === true);
    if (klass === 'unknown') {
      violations.push({
        subject: name,
        message:
          'không có cột workspace_id và không thuộc nhóm bảng đã khai báo trong check-rls.ts (hệ thống / xác thực)',
      });
    } else if (klass !== 'system') {
      rlsTables.set(name, klass);
      if (row.rls !== true) {
        violations.push({ subject: name, message: 'chưa bật RLS (ENABLE ROW LEVEL SECURITY)' });
      }
      if (Number(row.policies) === 0) {
        violations.push({ subject: name, message: 'chưa có policy nào' });
      }
    }
    for (const roleName of [APP_ROLE, AUTH_ROLE]) {
      if (row.owner === roleName) {
        violations.push({ subject: name, message: `role ${roleName} không được sở hữu bảng` });
      }
    }
  }

  // --- Mỗi quyền của cf_app trên bảng RLS phải có policy ĐÚNG LỆNH và đúng mẫu ---
  // has_any_column_privilege gồm cả quyền cấp theo cột (GRANT UPDATE (cột) ...).
  const privileges = await db.query(`/* privileges */
    SELECT n.nspname || '.' || c.relname AS name,
           has_any_column_privilege('${APP_ROLE}', c.oid, 'SELECT') AS can_select,
           has_any_column_privilege('${APP_ROLE}', c.oid, 'INSERT') AS can_insert,
           has_any_column_privilege('${APP_ROLE}', c.oid, 'UPDATE') AS can_update,
           has_table_privilege('${APP_ROLE}', c.oid, 'DELETE') AS can_delete,
           has_table_privilege('${APP_ROLE}', c.oid, 'TRUNCATE') AS can_truncate,
           has_table_privilege('${APP_ROLE}', c.oid, 'TRIGGER') AS can_trigger,
           has_table_privilege('${APP_ROLE}', c.oid, 'REFERENCES') AS can_references
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('core', 'cf')`);
  const policies = await db.query(`/* policies */
    SELECT n.nspname || '.' || c.relname AS name, p.polname, p.polcmd,
           p.polpermissive AS permissive,
           (0 = ANY(p.polroles)
            OR EXISTS (SELECT 1 FROM unnest(p.polroles) AS rid
                       WHERE rid <> 0 AND pg_has_role('${APP_ROLE}', rid, 'MEMBER'))) AS applies_to_app,
           (0 = ANY(p.polroles)
            OR EXISTS (SELECT 1 FROM unnest(p.polroles) AS rid
                       WHERE rid <> 0 AND pg_has_role('${AUTH_ROLE}', rid, 'MEMBER'))
           ) AS applies_to_auth,
           pg_get_expr(p.polqual, p.polrelid) AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS withcheck
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('core', 'cf')`);

  for (const row of privileges.rows) {
    const name = String(row.name);
    for (const [key, label] of [
      ['can_truncate', 'TRUNCATE'],
      ['can_trigger', 'TRIGGER'],
      ['can_references', 'REFERENCES'],
    ] as const) {
      if (row[key] === true) {
        violations.push({ subject: name, message: `${APP_ROLE} không được có quyền ${label}` });
      }
    }
    // Bảng hệ thống không RLS (feature_flags): cf_app chỉ được SELECT (ghi cờ là việc của role Admin).
    if (
      SYSTEM_TABLES.includes(name) &&
      (row.can_insert === true || row.can_update === true || row.can_delete === true)
    ) {
      violations.push({
        subject: name,
        message: `bảng hệ thống chỉ cho ${APP_ROLE} quyền SELECT (đang có quyền ghi)`,
      });
    }
    if (
      AUTH_ONLY_TABLES.includes(name) &&
      (row.can_select === true ||
        row.can_insert === true ||
        row.can_update === true ||
        row.can_delete === true)
    ) {
      violations.push({
        subject: name,
        message: `${APP_ROLE} không được có quyền nào trên bảng chỉ dành cho ${AUTH_ROLE}`,
      });
    }
    const klass = rlsTables.get(name);
    if (!klass) continue;
    const granted: Record<Command, boolean> = {
      SELECT: row.can_select === true,
      INSERT: row.can_insert === true,
      UPDATE: row.can_update === true,
      DELETE: row.can_delete === true,
    };
    for (const command of Object.keys(granted) as Command[]) {
      if (!granted[command]) continue;
      // Chỉ policy permissive áp cho cf_app (policy permissive cộng dồn bằng OR nên MỌI cái phải chặt).
      const relevant = policies.rows.filter(
        (p) =>
          String(p.name) === name &&
          p.permissive === true &&
          p.applies_to_app === true &&
          (String(p.polcmd) === POLICY_LETTER[command] || String(p.polcmd) === '*'),
      );
      const prefix = `${APP_ROLE} có quyền ${command} nhưng không có policy ${command}`;
      if (relevant.length === 0) {
        violations.push({
          subject: name,
          message: `${prefix} dựa vào ${klass.label} (không có policy nào áp cho ${APP_ROLE})`,
        });
        continue;
      }
      for (const p of relevant) {
        const isAll = String(p.polcmd) === '*';
        const usingOk = klass.isScoped(p.qual);
        // WITH CHECK: nếu có thì phải chặt; nếu thiếu, PostgreSQL dùng USING làm điều kiện ghi.
        const checkOk = p.withcheck == null ? usingOk : klass.isScoped(p.withcheck);
        let ok: boolean;
        if (command === 'INSERT') {
          ok = p.withcheck != null ? klass.isScoped(p.withcheck) : isAll && usingOk;
        } else if (command === 'UPDATE') {
          ok = usingOk && checkOk;
        } else {
          ok = usingOk;
        }
        if (!ok) {
          violations.push({
            subject: name,
            message: `${prefix} hợp lệ dựa vào ${klass.label}: policy "${String(p.polname)}" mở quá rộng hoặc sai mẫu`,
          });
        }
      }
    }
  }

  // --- View/materialized view trong core/cf (bỏ qua RLS của bảng gốc nếu thiếu security_invoker) ---
  const views = await db.query(`/* views */
    SELECT n.nspname || '.' || c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('v', 'm') AND n.nspname IN ('core', 'cf')`);
  for (const row of views.rows) {
    violations.push({
      subject: String(row.name),
      message: 'view/materialized view trong core/cf có thể bỏ qua RLS — không được phép',
    });
  }

  // --- Role ứng dụng và role xác thực ---
  await checkRole(db, APP_ROLE, '', violations);
  await checkRole(db, AUTH_ROLE, 'auth-', violations);
  await checkAuthRolePrivileges(db, policies.rows, violations);
  await checkSensitiveColumns(db, violations);
  await checkUsersColumnAllowlist(db, violations);
  await checkAdminInsertGuard(db, violations);

  // --- Hàm trong core/cf: PUBLIC không được có EXECUTE (trừ hàm trigger) ---
  const functions = await db.query(`/* public-functions */
    SELECT n.nspname || '.' || p.proname AS name
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('core', 'cf') AND p.prorettype <> 'trigger'::regtype
      AND (p.proacl IS NULL
           OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))`);
  for (const row of functions.rows) {
    violations.push({
      subject: String(row.name),
      message: 'PUBLIC đang có quyền EXECUTE trên hàm (cần REVOKE ALL ... FROM PUBLIC)',
    });
  }

  // --- PUBLIC không được có quyền bảng ---
  const publicGrants = await db.query(`/* public-grants */
    SELECT table_schema || '.' || table_name AS name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'PUBLIC' AND table_schema IN ('core', 'cf')`);
  for (const row of publicGrants.rows) {
    violations.push({
      subject: String(row.name),
      message: `PUBLIC đang có quyền ${String(row.privilege_type)}`,
    });
  }

  return violations;
}
