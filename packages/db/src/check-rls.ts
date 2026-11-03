/** Kiểm cấu hình RLS của schema core/cf (docs/10 §4, docs/13 §4). Dùng bởi CLI và CI. */

export type Queryable = {
  query: (text: string) => Promise<{ rows: Record<string, unknown>[] }>;
};
export type RlsViolation = { subject: string; message: string };

const APP_ROLE = 'cf_app';

/** Bảng hệ thống KHÔNG có RLS (cờ tính năng; chỉ SELECT cho cf_app). */
const SYSTEM_TABLES = ['core.feature_flags'];
/** Bảng không có workspace_id nhưng khóa chính chính là định danh workspace. */
const RLS_BY_OWN_ID_TABLES = ['core.workspaces'];
/** Bảng "của chính mình": policy phải dựa vào ngữ cảnh auth VÀ current_user_id(). */
const OWN_USER_TABLES = ['core.users', 'core.sessions', 'core.accounts', 'core.two_factors'];
/** Bảng chỉ ngữ cảnh auth mới đọc/ghi được. */
const AUTH_ONLY_TABLES = ['core.verifications'];

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
const USER_SHAPE = /core\.current_user_id\(\)/i;
/** Chặn các biểu thức mở toang (`true`, `... OR true`). */
const hasTrueLiteral = (expr: string): boolean => /\btrue\b/i.test(expr);

const workspaceClass: PolicyClass = {
  label: 'current_workspace_id()',
  isScoped: (expr) =>
    typeof expr === 'string' && WORKSPACE_SHAPE.test(expr) && !hasTrueLiteral(expr),
};
const ownUserClass: PolicyClass = {
  label: 'in_auth_context() và current_user_id()',
  isScoped: (expr) =>
    typeof expr === 'string' &&
    AUTH_SHAPE.test(expr) &&
    USER_SHAPE.test(expr) &&
    !hasTrueLiteral(expr),
};
const authOnlyClass: PolicyClass = {
  label: 'in_auth_context()',
  isScoped: (expr) => typeof expr === 'string' && AUTH_SHAPE.test(expr) && !hasTrueLiteral(expr),
};

function classify(name: string, hasWorkspaceId: boolean): PolicyClass | 'system' | 'unknown' {
  if (hasWorkspaceId || RLS_BY_OWN_ID_TABLES.includes(name)) return workspaceClass;
  if (OWN_USER_TABLES.includes(name)) return ownUserClass;
  if (AUTH_ONLY_TABLES.includes(name)) return authOnlyClass;
  if (SYSTEM_TABLES.includes(name)) return 'system';
  return 'unknown';
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
    if (row.owner === APP_ROLE) {
      violations.push({ subject: name, message: `role ${APP_ROLE} không được sở hữu bảng` });
    }
  }

  // --- Mỗi quyền của cf_app trên bảng RLS phải có policy ĐÚNG LỆNH và đúng mẫu ---
  // has_any_column_privilege gồm cả quyền cấp theo cột (GRANT UPDATE (cột) ...).
  const privileges = await db.query(`/* privileges */
    SELECT n.nspname || '.' || c.relname AS name,
           has_any_column_privilege('${APP_ROLE}', c.oid, 'SELECT') AS can_select,
           has_any_column_privilege('${APP_ROLE}', c.oid, 'INSERT') AS can_insert,
           has_any_column_privilege('${APP_ROLE}', c.oid, 'UPDATE') AS can_update,
           has_table_privilege('${APP_ROLE}', c.oid, 'DELETE') AS can_delete
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('core', 'cf')`);
  const policies = await db.query(`/* policies */
    SELECT n.nspname || '.' || c.relname AS name, p.polname, p.polcmd,
           p.polpermissive AS permissive,
           (0 = ANY(p.polroles)
            OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = '${APP_ROLE}' AND r.oid = ANY(p.polroles))) AS applies_to_app,
           pg_get_expr(p.polqual, p.polrelid) AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS withcheck
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('core', 'cf')`);

  for (const row of privileges.rows) {
    const name = String(row.name);
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

  // --- Role ứng dụng ---
  const role = await db.query(`/* role */
    SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = '${APP_ROLE}'`);
  const appRole = role.rows[0];
  if (!appRole) {
    violations.push({ subject: APP_ROLE, message: 'role không tồn tại' });
  } else {
    if (appRole.rolsuper === true) violations.push({ subject: APP_ROLE, message: 'là superuser' });
    if (appRole.rolbypassrls === true)
      violations.push({ subject: APP_ROLE, message: 'có BYPASSRLS' });
    if (appRole.rolcreatedb === true)
      violations.push({ subject: APP_ROLE, message: 'có quyền CREATEDB' });
    if (appRole.rolcreaterole === true)
      violations.push({ subject: APP_ROLE, message: 'có quyền CREATEROLE' });

    // Không được tạo đối tượng trong schema ứng dụng hoặc trong database.
    const create = await db.query(`/* create-privileges */
      SELECT has_schema_privilege('${APP_ROLE}', 'core', 'CREATE') AS core_create,
             has_schema_privilege('${APP_ROLE}', 'cf', 'CREATE') AS cf_create,
             has_schema_privilege('${APP_ROLE}', 'public', 'CREATE') AS public_create,
             has_database_privilege('${APP_ROLE}', current_database(), 'CREATE') AS db_create`);
    const grants = create.rows[0] ?? {};
    for (const [key, label] of [
      ['core_create', 'schema core'],
      ['cf_create', 'schema cf'],
      ['public_create', 'schema public'],
      ['db_create', 'database'],
    ] as const) {
      if (grants[key] === true) {
        violations.push({ subject: APP_ROLE, message: `có quyền CREATE trên ${label}` });
      }
    }
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
