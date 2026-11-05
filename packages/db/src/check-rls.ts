/** Kiểm cấu hình RLS của schema core/cf (docs/10 §4, docs/13 §4). Dùng bởi CLI và CI. */

export type Queryable = {
  query: (text: string) => Promise<{ rows: Record<string, unknown>[] }>;
};
export type RlsViolation = { subject: string; message: string };

const APP_ROLE = 'cf_app';
/** Role riêng của adapter Better Auth: chỉ chạm các bảng xác thực, và chỉ trong ngữ cảnh app.ctx = 'auth'. */
const AUTH_ROLE = 'cf_auth';
/** Role riêng của worker (0030, ADR 011): đường DUY NHẤT là "hệ thống" và đọc được ciphertext token. Thành viên của cf_app. */
const WORKER_ROLE = 'cf_worker';

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
  // lời mời: sau khi tạo chỉ thu hồi được (revoked_at); không sửa token/email/vai trò/hạn/đã-dùng
  ['cf_app', 'core.invitations', 'token_hash', 'UPDATE'],
  // băm token mời: chỉ hàm DEFINER (0015) so khớp; cf_app không đọc được (kể cả Owner)
  ['cf_app', 'core.invitations', 'token_hash', 'SELECT'],
  // kênh nền tảng (CH-SCHEMA): token Page không đọc/ghi được bằng cf_app (hàm DEFINER của TOKEN-ENC); khóa gửi do Admin
  ['cf_app', 'cf.channels', 'access_token_enc', 'SELECT'],
  ['cf_app', 'cf.channels', 'access_token_enc', 'INSERT'],
  ['cf_app', 'cf.channels', 'access_token_enc', 'UPDATE'],
  ['cf_app', 'cf.channels', 'key_version', 'SELECT'],
  ['cf_app', 'cf.channels', 'key_version', 'INSERT'],
  ['cf_app', 'cf.channels', 'key_version', 'UPDATE'],
  ['cf_app', 'cf.channels', 'send_suspended_until', 'UPDATE'],
  ['cf_app', 'cf.channels', 'send_suspended_until', 'INSERT'],
  ['cf_app', 'cf.channels', 'send_suspended_reason', 'UPDATE'],
  ['cf_app', 'cf.channels', 'send_suspended_reason', 'INSERT'],
  ['cf_app', 'cf.channels', 'rate_limit_override', 'UPDATE'],
  ['cf_app', 'cf.channels', 'rate_limit_override', 'INSERT'],
  ['cf_app', 'cf.channels', 'workspace_id', 'UPDATE'],
  ['cf_app', 'cf.channels', 'platform', 'UPDATE'],
  ['cf_app', 'cf.channels', 'external_id', 'UPDATE'],
  ['cf_app', 'cf.posts', 'workspace_id', 'UPDATE'],
  ['cf_app', 'cf.posts', 'channel_id', 'UPDATE'],
  ['cf_app', 'cf.posts', 'external_id', 'UPDATE'],
  ['cf_app', 'cf.comments', 'workspace_id', 'UPDATE'],
  ['cf_app', 'cf.comments', 'channel_id', 'UPDATE'],
  ['cf_app', 'cf.comments', 'post_id', 'UPDATE'],
  ['cf_app', 'cf.comments', 'external_id', 'UPDATE'],
  // hàng đợi gửi trả lời (ADR 008): nội dung/người yêu cầu/đích không sửa được sau khi tạo
  ['cf_app', 'cf.comment_replies', 'text', 'UPDATE'],
  ['cf_app', 'cf.comment_replies', 'requested_by', 'UPDATE'],
  ['cf_app', 'cf.comment_replies', 'workspace_id', 'UPDATE'],
  ['cf_app', 'cf.comment_replies', 'comment_id', 'UPDATE'],
  ['cf_app', 'cf.comment_replies', 'channel_id', 'UPDATE'],
  ['cf_app', 'cf.comment_replies', 'previous_status', 'UPDATE'],
  // hàng đợi ẩn/bỏ ẩn (ADR 009): hành động/người yêu cầu/đích không sửa được sau khi tạo
  ['cf_app', 'cf.comment_hides', 'action', 'UPDATE'],
  ['cf_app', 'cf.comment_hides', 'requested_by', 'UPDATE'],
  ['cf_app', 'cf.comment_hides', 'workspace_id', 'UPDATE'],
  ['cf_app', 'cf.comment_hides', 'comment_id', 'UPDATE'],
  ['cf_app', 'cf.comment_hides', 'channel_id', 'UPDATE'],
  ['cf_app', 'cf.webhook_events', 'workspace_id', 'UPDATE'],
  ['cf_app', 'cf.webhook_events', 'event_hash', 'UPDATE'],
  ['cf_app', 'cf.webhook_events', 'payload', 'UPDATE'],
  ['cf_app', 'core.invitations', 'email', 'UPDATE'],
  ['cf_app', 'core.invitations', 'role', 'UPDATE'],
  ['cf_app', 'core.invitations', 'expires_at', 'UPDATE'],
  ['cf_app', 'core.invitations', 'accepted_at', 'UPDATE'],
  ['cf_app', 'core.invitations', 'workspace_id', 'UPDATE'],
  ['cf_app', 'core.invitations', 'invited_by', 'UPDATE'],
  // thành viên: chỉ sửa role/status/updated_at (không đổi user_id → chuyển ghế Owner, không giả người mời)
  // workspaces: Owner chỉ sửa name/slug/timezone/default_lang/ai_enabled (0018); không status/ai_cost_cap_usd/emergency_stopped_at/created_by
  ['cf_app', 'core.workspaces', 'status', 'UPDATE'],
  ['cf_app', 'core.workspaces', 'ai_cost_cap_usd', 'UPDATE'],
  ['cf_app', 'core.workspaces', 'emergency_stopped_at', 'UPDATE'],
  ['cf_app', 'core.workspaces', 'created_by', 'UPDATE'],
  ['cf_app', 'core.workspaces', 'created_at', 'UPDATE'],
  ['cf_app', 'core.workspaces', 'id', 'UPDATE'],
  ['cf_app', 'core.members', 'user_id', 'UPDATE'],
  ['cf_app', 'core.members', 'workspace_id', 'UPDATE'],
  ['cf_app', 'core.members', 'invited_by', 'UPDATE'],
  ['cf_app', 'core.members', 'id', 'UPDATE'],
  ['cf_app', 'core.members', 'created_at', 'UPDATE'],
  ['cf_app', 'core.invitations', 'id', 'UPDATE'],
  ['cf_app', 'core.invitations', 'created_at', 'UPDATE'],
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

/** Biểu thức WITH CHECK đúng của policy 0011 như `pg_get_expr` in ra (đã chuẩn hóa): `((NOT is_admin) AND (admin_role IS NULL))`. */
const ADMIN_INSERT_GUARD_EXPR = '((notis_admin)and(admin_roleisnull))';

/** Chỉ bỏ khoảng trắng + hạ chữ thường; GIỮ ngoặc vì `NOT (a AND b)` khác nghĩa `(NOT a) AND b`. */
const normalizeExpr = (expr: string): string => expr.replace(/\s/g, '').toLowerCase();

/**
 * cf_auth có INSERT mức bảng trên core.users nên chốt duy nhất chặn nó tạo Admin là policy RESTRICTIVE
 * (migration 0011): phải còn tồn tại, áp cho INSERT/ALL, và điều kiện đúng bằng `NOT is_admin AND admin_role IS NULL` (so khớp chính xác).
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
      typeof row.withcheck === 'string' && normalizeExpr(row.withcheck) === ADMIN_INSERT_GUARD_EXPR,
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

/**
 * Hàm SECURITY DEFINER trong core/cf: phải có search_path cố định CÓ pg_temp ở cuối và không do cf_app/cf_auth sở hữu;
 * trigger giữ Owner cuối cùng phải tồn tại và đang bật. Câu truy vấn chỉ trả các dòng VI PHẠM (rỗng = đạt).
 */
async function checkDefinerFunctions(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const bad = await db.query(`/* definer-functions */
    SELECT n.nspname || '.' || p.proname AS name,
      CASE
        WHEN pg_get_userbyid(p.proowner) IN ('${APP_ROLE}', '${AUTH_ROLE}') THEN 'do ' || pg_get_userbyid(p.proowner) || ' sở hữu'
        WHEN NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%')
          THEN 'thiếu search_path cố định'
        ELSE 'search_path thiếu pg_temp ở cuối'
      END AS problem
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('core', 'cf') AND p.prosecdef
      AND (pg_get_userbyid(p.proowner) IN ('${APP_ROLE}', '${AUTH_ROLE}')
           OR NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
                          WHERE c LIKE 'search_path=%' AND c LIKE '%pg_temp'))`);
  for (const row of bad.rows) {
    violations.push({
      subject: String(row.name),
      message: `hàm SECURITY DEFINER không an toàn: ${String(row.problem)}`,
    });
  }
  // Giới hạn cột ở đường người dùng (channels/comments) dựa hoàn toàn vào hai trigger này (0019): phải tồn tại và đang bật.
  const guards = await db.query(`/* column-guard-triggers */
    SELECT v.tbl AS name, v.trg AS trg FROM (VALUES
      ('cf.channels', 'channels_guard_user_update'), ('cf.comments', 'comments_guard_user_update'),
      ('cf.comments', 'comments_apply_tombstone')) AS v(tbl, trg)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = v.tbl::regclass AND t.tgname = v.trg AND NOT t.tgisinternal AND t.tgenabled = 'O')`);
  for (const row of guards.rows) {
    violations.push({
      subject: String(row.name),
      message: `thiếu hoặc tắt trigger ${String(row.trg)} (giới hạn cột của đường người dùng)`,
    });
  }
  // Mọi quyền "hệ thống" dựa vào thân core.is_system_context(): phải đòi app.ctx = 'system' VÀ không có người dùng.
  const systemFn = await db.query(`/* is-system-context-body */
    SELECT 'core.is_system_context' AS name WHERE NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'core'::regnamespace AND p.proname = 'is_system_context'
        AND p.prosrc LIKE '%app.ctx%' AND p.prosrc LIKE '%''system''%' AND p.prosrc LIKE '%current_user_id() IS NULL%'
        AND p.prosrc LIKE '%session_user = ''${WORKER_ROLE}''%'
        AND p.prosrc NOT ILIKE '% OR %' AND p.prosrc NOT LIKE '%<>%' AND p.prosrc NOT LIKE '%!=%')`);
  for (const row of systemFn.rows) {
    violations.push({
      subject: String(row.name),
      message:
        "thân hàm phải đòi app.ctx = 'system', current_user_id() IS NULL và session_user = 'cf_worker' (mọi quyền hệ thống dựa vào đây; thiếu session_user thì web tự đặt app.ctx là thành hệ thống)",
    });
  }
  // cf_app không có INSERT ở bất kỳ cột nào: kênh chỉ tạo qua cf.create_channel, sự kiện webhook chỉ ghi qua
  // cf.record_webhook_event (hàm DEFINER tự kiểm quyền/ngữ cảnh).
  const noInsert = await db.query(`/* channels-no-insert */
    SELECT v.t AS name FROM (VALUES ('cf.channels'), ('cf.webhook_events'), ('cf.comment_replies'), ('cf.comment_hides'), ('cf.comment_tombstones')) AS v(t)
    WHERE has_any_column_privilege('${APP_ROLE}', v.t::regclass, 'INSERT')`);
  for (const row of noInsert.rows) {
    violations.push({
      subject: String(row.name),
      message: `${APP_ROLE} không được INSERT (ghi qua hàm DEFINER: cf.create_channel / cf.record_webhook_event / cf.request_comment_reply / cf.request_comment_hide)`,
    });
  }
  const trigger = await db.query(`/* last-owner-trigger */
    SELECT 'core.members' AS name WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'core.members'::regclass AND t.tgname = 'members_guard_last_owner'
        AND NOT t.tgisinternal AND t.tgenabled = 'O')`);
  for (const row of trigger.rows) {
    violations.push({
      subject: String(row.name),
      message:
        'thiếu trigger members_guard_last_owner (hoặc đang bị tắt): workspace có thể mất Owner cuối cùng',
    });
  }
}

/**
 * Policy "người gọi" (migration 0016): mỗi lệnh dưới đây phải có policy permissive dựa vào hàm kiểm Owner/thành viên.
 * Câu truy vấn chỉ trả các cặp VI PHẠM (rỗng = đạt).
 */
const ACTOR_POLICIES: Array<[table: string, command: 'a' | 'w' | 'r', marker: string]> = [
  ['core.members', 'a', 'workspace_bootstrap_open'], // INSERT: chỉ đường khởi tạo (thành viên khác vào qua accept_invitation)
  ['core.members', 'w', 'is_workspace_owner'], // UPDATE
  ['core.invitations', 'r', 'is_workspace_owner'], // SELECT
  ['core.invitations', 'a', 'is_workspace_owner'],
  ['core.invitations', 'w', 'is_workspace_owner'],
  ['core.workspaces', 'w', 'is_workspace_owner'],
  ['core.workspaces', 'a', 'created_by'], // INSERT ghi đúng người tạo (đường khởi tạo Owner)
  ['core.action_logs', 'a', 'current_user_id'], // người ghi không giả được người khác
  ['core.action_logs', 'a', 'is_system_context'], // 0029: dòng system/ai chỉ qua ngữ cảnh hệ thống (withJob), withWorkspace trần bị chặn
  ['core.action_logs', 'a', 'on_behalf_of'], // 0029: đường người dùng không tự đặt người yêu cầu (on_behalf_of IS NULL)
  // đọc (0028): Owner cả workspace, Staff chỉ dòng `user` của mình; mọi policy SELECT permissive phải chứa đủ ba marker
  ['core.action_logs', 'r', 'is_workspace_owner'],
  ['core.action_logs', 'r', 'current_user_id'],
  ['core.action_logs', 'r', 'actor_type'],
  ['core.action_logs', 'r', 'on_behalf_of'], // 0029: Staff thấy dòng system do mình yêu cầu
  // CH-SCHEMA (feat/ch-schema, ADR 007): ghi theo vai trò hoặc ĐƯỜNG HỆ THỐNG (withJob → is_system_context()).
  // Không có policy INSERT cho cf.channels (cf_app không INSERT: tạo kênh qua hàm DEFINER của TOKEN-ENC).
  ['cf.channels', 'w', 'is_workspace_owner'], // + is_system_context (trigger giới hạn cột cho đường người dùng)
  ['cf.channels', 'r', 'is_workspace_member'], // người gọi phải là thành viên (hoặc không người dùng) — chống sai id
  ['cf.posts', 'a', 'is_system_context'],
  ['cf.posts', 'w', 'is_system_context'],
  ['cf.posts', 'r', 'is_workspace_member'],
  ['cf.comments', 'a', 'is_system_context'],
  ['cf.comments', 'w', 'is_workspace_member'], // + is_system_context (trigger chặn sửa dữ liệu nền tảng ở đường người dùng)
  ['cf.comments', 'r', 'is_workspace_member'],
  // cf.webhook_events: KHÔNG có INSERT cho cf_app (đường ghi duy nhất = cf.record_webhook_event, migration 0022).
  ['cf.webhook_events', 'w', 'is_system_context'],
  // cf.comment_replies: KHÔNG INSERT cho cf_app (chỉ qua cf.request_comment_reply); UPDATE kết quả chỉ hệ thống.
  ['cf.comment_replies', 'w', 'is_system_context'],
  ['cf.comment_replies', 'r', 'is_workspace_member'],
  // cf.comment_hides: KHÔNG INSERT cho cf_app (chỉ qua cf.request_comment_hide); UPDATE kết quả chỉ hệ thống.
  ['cf.comment_hides', 'w', 'is_system_context'],
  ['cf.comment_hides', 'r', 'is_workspace_member'],
  ['cf.webhook_events', 'r', 'is_workspace_owner'],
  // cf.comment_tombstones: cf_app KHÔNG có quyền trực tiếp (hàm DEFINER cf.mark_comment_deleted ghi); RLS chỉ hệ thống.
  ['cf.comment_tombstones', 'a', 'is_system_context'],
];

/** Chuỗi KHÔNG được xuất hiện trong policy của lệnh đó. */
const FORBIDDEN_IN_POLICY: Array<[table: string, command: 'a' | 'w' | 'r', marker: string]> = [
  ['core.members', 'a', 'is_workspace_owner'],
  // Chỉ-hệ thống: không được mở thêm nhánh thành viên/Owner/"không người dùng" trong CÙNG policy (OR)
  ['cf.webhook_events', 'w', 'is_workspace_member'],
  ['cf.comment_replies', 'w', 'is_workspace_member'],
  ['cf.comment_replies', 'w', 'is_workspace_owner'],
  ['cf.comment_replies', 'w', 'IS NULL'],
  ['cf.comment_hides', 'w', 'is_workspace_member'],
  ['cf.comment_hides', 'w', 'is_workspace_owner'],
  ['cf.comment_hides', 'w', 'IS NULL'],
  ['cf.webhook_events', 'w', 'is_workspace_owner'],
  ['cf.posts', 'a', 'is_workspace_member'],
  ['cf.posts', 'w', 'is_workspace_member'],
  ['cf.posts', 'a', 'is_workspace_owner'],
  ['cf.posts', 'w', 'is_workspace_owner'],
  ['cf.comments', 'a', 'is_workspace_member'],
  ['cf.comments', 'a', 'is_workspace_owner'],
  ['cf.channels', 'w', 'is_workspace_member'], // Staff không ghi kênh
  ['cf.channels', 'r', 'is_workspace_owner'], // đọc kênh không riêng Owner
  ['cf.webhook_events', 'r', 'is_workspace_member'], // Staff không đọc payload
  // "hệ thống" phải là is_system_context(), KHÔNG phải "không có người dùng" thuần (withWorkspace trần sẽ được nâng quyền)
  ['cf.channels', 'w', 'IS NULL'],
  ['cf.posts', 'a', 'IS NULL'],
  ['cf.posts', 'w', 'IS NULL'],
  ['cf.comments', 'a', 'IS NULL'],
  ['cf.comments', 'w', 'IS NULL'],
  ['cf.webhook_events', 'w', 'IS NULL'],
  ['cf.webhook_events', 'r', 'IS NULL'],
  ['cf.comment_tombstones', 'a', 'is_workspace_member'],
  ['cf.comment_tombstones', 'a', 'is_workspace_owner'],
  ['cf.comment_tombstones', 'a', 'IS NULL'],
];

async function checkActorPolicies(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const values = ACTOR_POLICIES.map(([t, c, m]) => `('${t}', '${c}', '${m}')`).join(', ');
  // Policy permissive cộng dồn bằng OR: MỌI policy permissive áp cho cf_app (kể cả FOR ALL '*') ở lệnh đó phải chứa
  // marker; và phải có ít nhất một. Vi phạm = thiếu policy, hoặc tồn tại một policy permissive thứ hai không có marker.
  const bad = await db.query(`/* actor-policies */
    WITH app AS (SELECT oid FROM pg_roles WHERE rolname = '${APP_ROLE}'),
    pol AS (
      SELECT v.t, v.c, v.m,
             (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) AS txt,
             p.polname
      FROM (VALUES ${values}) AS v(t, c, m)
      JOIN pg_policy p ON p.polrelid = v.t::regclass AND p.polpermissive
           AND (p.polcmd = v.c::"char" OR p.polcmd = '*')
           AND (0 = ANY(p.polroles)
                OR EXISTS (SELECT 1 FROM unnest(p.polroles) rid WHERE rid <> 0 AND pg_has_role('${APP_ROLE}', rid, 'MEMBER')))
    )
    SELECT v.t AS tbl, v.c AS cmd, v.m AS marker, 'thiếu policy có marker' AS problem
    FROM (VALUES ${values}) AS v(t, c, m)
    WHERE NOT EXISTS (SELECT 1 FROM pol WHERE pol.t = v.t AND pol.c = v.c AND pol.txt LIKE '%' || pol.m || '%')
    UNION ALL
    SELECT pol.t, pol.c, pol.m, 'policy permissive "' || pol.polname || '" không có marker (OR sẽ mở lại quyền)'
    FROM pol WHERE pol.txt NOT LIKE '%' || pol.m || '%'`);
  for (const row of bad.rows) {
    violations.push({
      subject: String(row.tbl),
      message: `policy "người gọi" (${String(row.marker)}) cho lệnh '${String(row.cmd)}' không đạt: ${String(row.problem)}`,
    });
  }
  // Chuỗi bị cấm trong policy (ví dụ Owner không được INSERT thẳng vào members).
  const fvalues = FORBIDDEN_IN_POLICY.map(([t, c, m]) => `('${t}', '${c}', '${m}')`).join(', ');
  const forbidden = await db.query(`/* actor-forbidden */
    SELECT v.t AS tbl, v.c AS cmd, v.m AS marker
    FROM (VALUES ${fvalues}) AS v(t, c, m)
    JOIN pg_policy p ON p.polrelid = v.t::regclass AND p.polpermissive
         AND (p.polcmd = v.c::"char" OR p.polcmd = '*')
    WHERE (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          LIKE '%' || v.m || '%'`);
  for (const row of forbidden.rows) {
    violations.push({
      subject: String(row.tbl),
      message: `policy cho lệnh '${String(row.cmd)}' KHÔNG được chứa ${String(row.marker)} (thành viên chỉ vào qua lời mời / đường khởi tạo)`,
    });
  }
}

/** Bảng cf_app KHÔNG BAO GIỜ được DELETE (xóa mềm bằng status; xóa thật do job/role bảo trì riêng). */
const NO_DELETE_TABLES = [
  'cf.channels',
  'cf.posts',
  'cf.comments',
  'cf.webhook_events',
  'cf.comment_replies',
  'cf.comment_hides',
  'cf.comment_tombstones',
  'cf.ai_usage',
  'core.members',
  'core.invitations',
  'core.action_logs',
  'core.workspaces',
];

async function checkNoDelete(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const values = NO_DELETE_TABLES.map((t) => `('${t}')`).join(', ');
  const found = await db.query(`/* no-delete */
    SELECT v.t AS tbl FROM (VALUES ${values}) AS v(t)
    WHERE has_table_privilege('${APP_ROLE}', v.t::regclass, 'DELETE')`);
  for (const row of found.rows) {
    violations.push({
      subject: String(row.tbl),
      message: `${APP_ROLE} không được có quyền DELETE (xóa mềm bằng status; xóa thật do job/role bảo trì)`,
    });
  }
}

/**
 * Bốn hàm token Page (0020): phải tồn tại, PUBLIC không EXECUTE, cf_app có EXECUTE; `read_channel_token` chỉ cho đường
 * hệ thống (thân hàm có is_system_context, KHÔNG có is_workspace_*); mọi hàm giới hạn theo workspace hiện tại.
 */
const TOKEN_FUNCTIONS = [
  'create_channel',
  'set_channel_token',
  'clear_channel_token',
  'read_channel_token',
];

/**
 * Quan hệ cf_worker ↔ cf_app (0030): worker kế thừa quyền của cf_app (thành viên có INHERIT) còn cf_app/cf_auth KHÔNG được
 * là thành viên cf_worker (nếu không web nâng quyền thành worker bằng SET ROLE). Thuộc tính role/CREATE do checkRole kiểm.
 */
async function checkWorkerMembership(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const found = await db.query(`/* worker-membership */
    SELECT '${WORKER_ROLE}' AS name, v.problem
    FROM (VALUES
      ('không kế thừa quyền ${APP_ROLE} (cần GRANT ${APP_ROLE} TO ${WORKER_ROLE})',
        NOT pg_has_role('${WORKER_ROLE}', '${APP_ROLE}', 'USAGE')),
      ('${APP_ROLE} là thành viên ${WORKER_ROLE} (web nâng quyền thành worker được)',
        pg_has_role('${APP_ROLE}', '${WORKER_ROLE}', 'MEMBER')),
      ('${AUTH_ROLE} là thành viên ${WORKER_ROLE}',
        pg_has_role('${AUTH_ROLE}', '${WORKER_ROLE}', 'MEMBER'))
    ) AS v(problem, bad)
    WHERE v.bad`);
  for (const row of found.rows) {
    violations.push({ subject: String(row.name), message: String(row.problem) });
  }
}

/**
 * cf_worker không được có quyền TRỰC TIẾP nào (mọi quyền bảng/cột/sequence/hàm đến từ việc kế thừa cf_app) ngoại trừ
 * EXECUTE cf.read_channel_token. Đọc thẳng ACL (relacl/attacl/proacl) nên không phụ thuộc người chạy kiểm tra.
 */
async function checkWorkerDirectPrivileges(
  db: Queryable,
  violations: RlsViolation[],
): Promise<void> {
  const found = await db.query(`/* worker-direct-privileges */
    WITH w AS (SELECT oid FROM pg_roles WHERE rolname = '${WORKER_ROLE}')
    SELECT n.nspname || '.' || c.relname AS name, 'quyền ' || a.privilege_type || ' trên bảng/sequence' AS problem
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(c.relacl) a, w
    WHERE c.relacl IS NOT NULL AND a.grantee = w.oid AND n.nspname IN ('core', 'cf', 'public')
    UNION ALL
    SELECT n.nspname || '.' || c.relname, 'quyền ' || a.privilege_type || ' trên cột ' || t.attname
    FROM pg_attribute t JOIN pg_class c ON c.oid = t.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(t.attacl) a, w
    WHERE t.attacl IS NOT NULL AND a.grantee = w.oid AND n.nspname IN ('core', 'cf', 'public')
    UNION ALL
    SELECT n.nspname || '.' || p.proname, 'quyền ' || a.privilege_type || ' trên hàm (chỉ được read_channel_token)'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL aclexplode(p.proacl) a, w
    WHERE p.proacl IS NOT NULL AND a.grantee = w.oid AND n.nspname IN ('core', 'cf', 'public')
      AND NOT (n.nspname = 'cf' AND p.proname = 'read_channel_token' AND a.privilege_type = 'EXECUTE')`);
  for (const row of found.rows) {
    violations.push({
      subject: String(row.name),
      message: `${WORKER_ROLE} không được có quyền trực tiếp (chỉ kế thừa từ ${APP_ROLE}): ${String(row.problem)}`,
    });
  }
}

async function checkTokenFunctions(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const names = TOKEN_FUNCTIONS.map((n) => `'${n}'`).join(', ');
  const found = await db.query(`/* token-functions */
    SELECT w.n AS name,
      CASE
        WHEN p.oid IS NULL THEN 'hàm không tồn tại'
        WHEN has_function_privilege('public', p.oid, 'EXECUTE') THEN 'PUBLIC có quyền EXECUTE'
        WHEN w.n <> 'read_channel_token' AND NOT has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE') THEN '${APP_ROLE} thiếu quyền EXECUTE'
        WHEN w.n = 'read_channel_token' AND has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE') THEN '${APP_ROLE} (web) không được có quyền EXECUTE (chỉ ${WORKER_ROLE})'
        WHEN w.n = 'read_channel_token' AND NOT has_function_privilege('${WORKER_ROLE}', p.oid, 'EXECUTE') THEN '${WORKER_ROLE} thiếu quyền EXECUTE'
        WHEN p.prosrc NOT LIKE '%current_workspace_id()%' THEN 'không giới hạn theo workspace hiện tại'
        WHEN w.n = 'read_channel_token' AND (p.prosrc NOT LIKE '%is_system_context()%' OR p.prosrc LIKE '%is_workspace_%')
          THEN 'read_channel_token phải chỉ cho đường hệ thống (is_system_context), không mở cho Owner/thành viên'
        WHEN w.n <> 'read_channel_token' AND p.prosrc NOT LIKE '%is_workspace_owner()%' THEN 'thiếu kiểm Owner/hệ thống'
      END AS problem
    FROM (VALUES ${TOKEN_FUNCTIONS.map((n) => `('${n}')`).join(', ')}) AS w(n)
    LEFT JOIN pg_proc p ON p.pronamespace = 'cf'::regnamespace AND p.proname = w.n
    WHERE w.n IN (${names}) AND (
      p.oid IS NULL
      OR has_function_privilege('public', p.oid, 'EXECUTE')
      OR (w.n <> 'read_channel_token' AND NOT has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE'))
      OR (w.n = 'read_channel_token' AND (has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE')
                                          OR NOT has_function_privilege('${WORKER_ROLE}', p.oid, 'EXECUTE')))
      OR p.prosrc NOT LIKE '%current_workspace_id()%'
      OR (w.n = 'read_channel_token' AND (p.prosrc NOT LIKE '%is_system_context()%' OR p.prosrc LIKE '%is_workspace_%'))
      OR (w.n <> 'read_channel_token' AND p.prosrc NOT LIKE '%is_workspace_owner()%'))`);
  for (const row of found.rows) {
    violations.push({
      subject: `cf.${String(row.name)}`,
      message: `hàm token Page: ${String(row.problem)}`,
    });
  }
}

/**
 * Hàm ghi sự kiện webhook (0022): phải tồn tại, PUBLIC không EXECUTE, và thân hàm chỉ cho NGỮ CẢNH TRẦN (từ chối khi có
 * workspace, người dùng hoặc ngữ cảnh job) — nếu không, đường khác tiêm được sự kiện sang workspace bất kỳ.
 */
async function checkWebhookFunction(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const found = await db.query(`/* webhook-function */
    SELECT 'cf.record_webhook_event' AS name,
      CASE
        WHEN p.oid IS NULL THEN 'hàm không tồn tại'
        WHEN has_function_privilege('public', p.oid, 'EXECUTE') THEN 'PUBLIC có quyền EXECUTE'
        WHEN NOT has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE') THEN '${APP_ROLE} thiếu quyền EXECUTE'
        ELSE 'thân hàm phải từ chối khi có workspace, người dùng hoặc ngữ cảnh job (chỉ ngữ cảnh trần)'
      END AS problem
    FROM (SELECT 1) AS one
    LEFT JOIN pg_proc p ON p.pronamespace = 'cf'::regnamespace AND p.proname = 'record_webhook_event'
    WHERE p.oid IS NULL
      OR has_function_privilege('public', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE')
      OR p.prosrc NOT LIKE '%current_workspace_id() IS NOT NULL%'
      OR p.prosrc NOT LIKE '%current_user_id() IS NOT NULL%'
      OR p.prosrc NOT LIKE '%is_system_context() IS NOT FALSE%'`);
  for (const row of found.rows) {
    violations.push({ subject: String(row.name), message: `hàm webhook: ${String(row.problem)}` });
  }
}

/**
 * Hàm tự rời workspace (0028): phải tồn tại, PUBLIC không EXECUTE, cf_app có EXECUTE, đúng MỘT tham số (không nhận
 * user id), người rời lấy từ current_user_id(), có khóa tư vấn theo workspace và chặn Owner cuối (members_last_owner).
 * Giới hạn: phần "thân hàm" chỉ kiểm bằng chuỗi con của prosrc (bắt xóa/đổi tên hạng mục, không chứng minh logic đúng —
 * logic được kiểm bằng test tích hợp member-leave.int.test.ts). Cũng đòi SECURITY DEFINER và cf_auth KHÔNG có EXECUTE.
 */
async function checkLeaveFunction(db: Queryable, violations: RlsViolation[]): Promise<void> {
  const found = await db.query(`/* leave-function */
    SELECT 'core.leave_workspace' AS name,
      CASE
        WHEN p.oid IS NULL THEN 'hàm không tồn tại'
        WHEN has_function_privilege('public', p.oid, 'EXECUTE') THEN 'PUBLIC có quyền EXECUTE'
        WHEN NOT has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE') THEN '${APP_ROLE} thiếu quyền EXECUTE'
        WHEN NOT p.prosecdef THEN 'phải là SECURITY DEFINER'
        WHEN has_function_privilege('${AUTH_ROLE}', p.oid, 'EXECUTE') THEN '${AUTH_ROLE} không được có quyền EXECUTE'
        WHEN p.pronargs <> 1 THEN 'chỉ được nhận MỘT tham số (workspace); không nhận user id'
        ELSE 'thân hàm thiếu current_user_id() / pg_advisory_xact_lock / members_last_owner'
      END AS problem
    FROM (SELECT 1) AS one
    LEFT JOIN pg_proc p ON p.pronamespace = 'core'::regnamespace AND p.proname = 'leave_workspace'
    WHERE p.oid IS NULL
      OR has_function_privilege('public', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('${APP_ROLE}', p.oid, 'EXECUTE')
      OR NOT p.prosecdef
      OR has_function_privilege('${AUTH_ROLE}', p.oid, 'EXECUTE')
      OR p.pronargs <> 1
      OR p.prosrc NOT LIKE '%core.current_user_id()%'
      OR p.prosrc NOT LIKE '%pg_advisory_xact_lock%'
      OR p.prosrc NOT LIKE '%members_last_owner%'`);
  for (const row of found.rows) {
    violations.push({ subject: String(row.name), message: `hàm tự rời: ${String(row.problem)}` });
  }
}

/**
 * Ràng buộc CHECK `action_logs_on_behalf_of_check` (0029): phải tồn tại, đã VALIDATE và định nghĩa chứa `on_behalf_of`
 * và `'system'` (chỉ dòng system mới có người yêu cầu; áp cả cho chủ bảng và hàm DEFINER).
 */
async function checkActionLogsOnBehalfCheck(
  db: Queryable,
  violations: RlsViolation[],
): Promise<void> {
  const found = await db.query(`/* action-logs-check */
    SELECT 'core.action_logs' AS name,
      CASE
        WHEN c.oid IS NULL THEN 'thiếu CHECK action_logs_on_behalf_of_check'
        WHEN NOT c.convalidated THEN 'CHECK action_logs_on_behalf_of_check chưa VALIDATE'
        ELSE 'CHECK action_logs_on_behalf_of_check sai định nghĩa (phải chứa on_behalf_of và system)'
      END AS problem
    FROM (SELECT 1) AS one
    LEFT JOIN pg_constraint c ON c.conrelid = 'core.action_logs'::regclass
      AND c.conname = 'action_logs_on_behalf_of_check' AND c.contype = 'c'
    WHERE c.oid IS NULL
      OR NOT c.convalidated
      OR pg_get_constraintdef(c.oid) NOT LIKE '%on_behalf_of%'
      OR pg_get_constraintdef(c.oid) NOT LIKE '%''system''%'`);
  for (const row of found.rows) {
    violations.push({ subject: String(row.name), message: String(row.problem) });
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
    for (const roleName of [APP_ROLE, AUTH_ROLE, WORKER_ROLE]) {
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
  await checkRole(db, WORKER_ROLE, 'worker-', violations);
  await checkWorkerMembership(db, violations);
  await checkWorkerDirectPrivileges(db, violations);
  await checkAuthRolePrivileges(db, policies.rows, violations);
  await checkSensitiveColumns(db, violations);
  await checkUsersColumnAllowlist(db, violations);
  await checkAdminInsertGuard(db, violations);
  await checkDefinerFunctions(db, violations);
  await checkActorPolicies(db, violations);
  await checkNoDelete(db, violations);
  await checkTokenFunctions(db, violations);
  await checkWebhookFunction(db, violations);
  await checkLeaveFunction(db, violations);
  await checkActionLogsOnBehalfCheck(db, violations);

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
