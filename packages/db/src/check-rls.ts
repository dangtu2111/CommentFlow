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

export async function checkRls(db: Queryable): Promise<RlsViolation[]> {
  const violations: RlsViolation[] = [];

  const tables = await db.query(`
    SELECT n.nspname || '.' || c.relname AS name,
           c.relrowsecurity AS rls,
           pg_get_userbyid(c.relowner) AS owner,
           EXISTS (SELECT 1 FROM pg_attribute a
                   WHERE a.attrelid = c.oid AND a.attname = 'workspace_id' AND NOT a.attisdropped) AS has_workspace_id,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('core', 'cf')
    ORDER BY 1`);

  for (const row of tables.rows) {
    const name = String(row.name);
    const hasWorkspaceId = row.has_workspace_id === true;
    const rls = row.rls === true;
    const policies = Number(row.policies);
    if (hasWorkspaceId || RLS_BY_OWN_ID_TABLES.includes(name)) {
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

  const role = await db.query(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '${APP_ROLE}'`,
  );
  const appRole = role.rows[0];
  if (!appRole) {
    violations.push({ subject: APP_ROLE, message: 'role không tồn tại' });
  } else {
    if (appRole.rolsuper === true) violations.push({ subject: APP_ROLE, message: 'là superuser' });
    if (appRole.rolbypassrls === true)
      violations.push({ subject: APP_ROLE, message: 'có BYPASSRLS' });
  }

  const publicGrants = await db.query(`
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
