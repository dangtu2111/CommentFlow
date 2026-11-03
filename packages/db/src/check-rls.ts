/** Kiểm cấu hình RLS của schema core/cf (docs/10 §4, docs/13 §4). Dùng bởi CLI và CI. */

export type Queryable = {
  query: (text: string) => Promise<{ rows: Record<string, unknown>[] }>;
};
export type RlsViolation = { subject: string; message: string };

/** Bảng hệ thống KHÔNG có workspace_id, không RLS theo workspace (đăng nhập, cờ tính năng). */
const SYSTEM_TABLES = [
  'core.users',
  'core.sessions',
  'core.accounts',
  'core.verifications',
  'core.feature_flags',
];
/** Bảng không có workspace_id nhưng khóa chính chính là định danh workspace: bắt buộc có RLS + policy. */
const RLS_BY_OWN_ID_TABLES = ['core.workspaces'];
const APP_ROLE = 'cf_app';
/** Mọi policy bảo vệ dữ liệu workspace phải dựa vào hàm này (không chấp nhận `USING (true)`). */
const CONTEXT_FUNCTION = 'current_workspace_id';

type Command = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
const POLICY_LETTER: Record<Command, string> = {
  SELECT: 'r',
  INSERT: 'a',
  UPDATE: 'w',
  DELETE: 'd',
};

const referencesContext = (expr: unknown): boolean =>
  typeof expr === 'string' && expr.includes(CONTEXT_FUNCTION);

export async function checkRls(db: Queryable): Promise<RlsViolation[]> {
  const violations: RlsViolation[] = [];

  // --- Bảng: RLS bật + có policy (tag /* tables */ để DB giả trong test nhận ra) ---
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

  const rlsTables: string[] = [];
  for (const row of tables.rows) {
    const name = String(row.name);
    const hasWorkspaceId = row.has_workspace_id === true;
    const rls = row.rls === true;
    const policies = Number(row.policies);
    if (hasWorkspaceId || RLS_BY_OWN_ID_TABLES.includes(name)) {
      rlsTables.push(name);
      if (!rls)
        violations.push({ subject: name, message: 'chưa bật RLS (ENABLE ROW LEVEL SECURITY)' });
      if (policies === 0) violations.push({ subject: name, message: 'chưa có policy nào' });
    } else if (!SYSTEM_TABLES.includes(name)) {
      violations.push({
        subject: name,
        message:
          'không có cột workspace_id và không nằm trong danh sách bảng hệ thống (check-rls.ts)',
      });
    }
    if (row.owner === APP_ROLE) {
      violations.push({ subject: name, message: `role ${APP_ROLE} không được sở hữu bảng` });
    }
  }

  // --- Quyền của cf_app trên từng bảng RLS phải có policy ĐÚNG LỆNH, dựa vào current_workspace_id() ---
  const privileges = await db.query(`/* privileges */
    SELECT n.nspname || '.' || c.relname AS name,
           has_table_privilege('${APP_ROLE}', c.oid, 'SELECT') AS can_select,
           has_table_privilege('${APP_ROLE}', c.oid, 'INSERT') AS can_insert,
           has_table_privilege('${APP_ROLE}', c.oid, 'UPDATE') AS can_update,
           has_table_privilege('${APP_ROLE}', c.oid, 'DELETE') AS can_delete
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('core', 'cf')`);
  const policies = await db.query(`/* policies */
    SELECT n.nspname || '.' || c.relname AS name, p.polname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS withcheck
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('core', 'cf')`);

  for (const row of privileges.rows) {
    const name = String(row.name);
    if (!rlsTables.includes(name)) continue;
    const granted: Record<Command, boolean> = {
      SELECT: row.can_select === true,
      INSERT: row.can_insert === true,
      UPDATE: row.can_update === true,
      DELETE: row.can_delete === true,
    };
    for (const command of Object.keys(granted) as Command[]) {
      if (!granted[command]) continue;
      const matching = policies.rows.filter(
        (p) =>
          String(p.name) === name &&
          (String(p.polcmd) === POLICY_LETTER[command] || String(p.polcmd) === '*'),
      );
      // INSERT chỉ có WITH CHECK; các lệnh còn lại dựa vào USING (UPDATE cần cả hai nếu có WITH CHECK).
      const ok = matching.some((p) =>
        command === 'INSERT'
          ? referencesContext(p.withcheck) ||
            (String(p.polcmd) === '*' && referencesContext(p.qual))
          : referencesContext(p.qual),
      );
      if (!ok) {
        violations.push({
          subject: name,
          message: `${APP_ROLE} có quyền ${command} nhưng không có policy ${command} dựa vào ${CONTEXT_FUNCTION}()`,
        });
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
