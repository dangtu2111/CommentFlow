import type pg from 'pg';

/**
 * DB-BOOTSTRAP: tiền đề của migration 0000 mà file SQL KHÔNG tự tạo — extension `citext` (cột email), `unaccent`/`pg_trgm` (tìm kiếm), `vector` (pgvector) và các role
 * `cf_owner`/`cf_app`/`cf_auth`/`cf_worker` (do `infra/postgres/init`). DB tạo bằng cách khác (staging/production) thiếu chúng thì migration 0000 lỗi khó đọc
 * (`type "citext" does not exist`, `role "cf_app" does not exist`). Kiểm TRƯỚC khi áp migration và báo rõ thiếu gì + cách xử lý. (Một migration "kế tiếp" không sửa được
 * lỗi ở 0000 trên DB trống, nên đây là bước kiểm trước, không phải migration.)
 */
export const REQUIRED_EXTENSIONS = ['citext', 'unaccent', 'pg_trgm', 'vector'] as const;
export const REQUIRED_ROLES = ['cf_owner', 'cf_app', 'cf_auth', 'cf_worker'] as const;

export type BootstrapState = {
  installedExtensions: readonly string[];
  availableExtensions: readonly string[];
  roles: readonly string[];
};

export type BootstrapReport = {
  /** Chưa cài trong DB này nhưng máy chủ có sẵn gói → `CREATE EXTENSION` là đủ. */
  installable: string[];
  /** Máy chủ Postgres không có gói (chưa cài pgvector…) → phải cài ở mức máy chủ. */
  unavailable: string[];
  missingRoles: string[];
  ok: boolean;
};

export function evaluateBootstrap(state: BootstrapState): BootstrapReport {
  const installed = new Set(state.installedExtensions);
  const available = new Set(state.availableExtensions);
  const roles = new Set(state.roles);
  const missing = REQUIRED_EXTENSIONS.filter((name) => !installed.has(name));
  const installable = missing.filter((name) => available.has(name));
  const unavailable = missing.filter((name) => !available.has(name));
  const missingRoles = REQUIRED_ROLES.filter((name) => !roles.has(name));
  return {
    installable,
    unavailable,
    missingRoles,
    ok: missing.length === 0 && missingRoles.length === 0,
  };
}

/** Thông báo cho người chạy migration (tiếng Việt, chỉ TÊN extension/role và lệnh mẫu — không mật khẩu, không chuỗi kết nối). */
export function formatBootstrapProblem(report: BootstrapReport): string {
  if (report.ok) return '';
  const lines = ['DB chưa đủ tiền đề để áp migration (DB-BOOTSTRAP):'];
  for (const name of report.installable) {
    lines.push(
      `- Thiếu extension "${name}" (máy chủ có sẵn): chạy bằng quyền cao trên DB này: CREATE EXTENSION IF NOT EXISTS ${name};`,
    );
  }
  for (const name of report.unavailable) {
    lines.push(
      name === 'vector'
        ? '- Máy chủ Postgres chưa có extension "vector": cài pgvector ở mức máy chủ (ví dụ dùng ảnh pgvector/pgvector), rồi CREATE EXTENSION IF NOT EXISTS vector;'
        : `- Máy chủ Postgres chưa có extension "${name}": cài gói contrib của Postgres, rồi CREATE EXTENSION IF NOT EXISTS ${name};`,
    );
  }
  if (report.missingRoles.length > 0) {
    lines.push(
      `- Thiếu role: ${report.missingRoles.join(', ')}. Tạo theo infra/postgres/init/10-roles-and-databases.sh (mật khẩu do bạn đặt, không ghi vào mã).`,
    );
  }
  return lines.join('\n');
}

/** Đọc trạng thái hiện tại của DB (chỉ đọc catalog). */
export async function readBootstrapState(db: Pick<pg.Pool, 'query'>): Promise<BootstrapState> {
  const [installed, available, roles] = await Promise.all([
    db.query<{ name: string }>('SELECT extname AS name FROM pg_extension'),
    db.query<{ name: string }>('SELECT name FROM pg_available_extensions'),
    db.query<{ name: string }>('SELECT rolname AS name FROM pg_roles'),
  ]);
  return {
    installedExtensions: installed.rows.map((r) => r.name),
    availableExtensions: available.rows.map((r) => r.name),
    roles: roles.rows.map((r) => r.name),
  };
}

/**
 * Kiểm tiền đề; extension "cài được" thì thử `CREATE EXTENSION IF NOT EXISTS` (cf_owner đủ quyền với extension tin cậy — citext, unaccent, pg_trgm; thiếu quyền thì bỏ qua và
 * để bước kiểm lại báo rõ). Thiếu gì còn lại → ném lỗi có thông điệp từ `formatBootstrapProblem`.
 */
export async function ensureBootstrap(db: Pick<pg.Pool, 'query'>): Promise<void> {
  const first = evaluateBootstrap(await readBootstrapState(db));
  if (first.ok) return;
  for (const name of first.installable) {
    try {
      // `name` luôn thuộc danh sách cố định `REQUIRED_EXTENSIONS` (không phải đầu vào ngoài).
      await db.query(`CREATE EXTENSION IF NOT EXISTS ${name}`);
    } catch {
      // Thiếu quyền: để bước kiểm lại bên dưới báo cách xử lý.
    }
  }
  const second = evaluateBootstrap(await readBootstrapState(db));
  if (!second.ok) throw new Error(formatBootstrapProblem(second));
}
