import { AppError } from '@flow/shared';

// Hàm THUẦN cho đường migrate/cài hàng đợi lên staging (không chạm DB, dễ unit test).
// `migration-guard.ts` (dev/test/ci) giữ nguyên và vẫn từ chối staging/production.
// Production KHÔNG có đường chạy bằng CLI: mọi cổng dưới đây từ chối cứng, không có cờ nào mở.

export type MigrationEntry = { idx: number; when: number; tag: string };

/** Tham số URL an toàn; mọi tham số khác (host, dbname, options…) bị từ chối vì có thể đổi đích kết nối. */
const SAFE_URL_PARAMS = new Set(['sslmode', 'connect_timeout', 'application_name']);
/** Nếu có `sslmode` thì chỉ các giá trị bắt buộc mã hóa (không disable/allow/prefer). */
const SAFE_SSLMODES = new Set(['require', 'verify-ca', 'verify-full']);
/** Workflow duy nhất được chạy CLI này. Chỉ chống chạy NHẦM; lớp bảo vệ thật là pg_hba + secret của environment. */
const ALLOWED_WORKFLOW_REF_SUFFIX = '/.github/workflows/migrate-staging.yml@refs/heads/main';
const DB_NAME_PATTERN = /^[a-z0-9_]{1,63}$/i;
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);

export const CONFIRM_FORMAT = '<tên-db>@<số-migration-cuối>';

const MIGRATION_TAG = /^(\d{4})_/;

/** Đọc `meta/_journal.json` của drizzle; sai hình dạng → lỗi cấu hình (không đoán). */
export function parseMigrationJournal(raw: unknown): MigrationEntry[] {
  const list = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list) || list.length === 0) {
    throw new AppError('CONFIG_INVALID', 'Journal migration rỗng hoặc sai định dạng.');
  }
  const entries = list.map((item): MigrationEntry => {
    const { idx, when, tag } = (item ?? {}) as Record<string, unknown>;
    if (
      typeof idx !== 'number' ||
      typeof when !== 'number' ||
      typeof tag !== 'string' ||
      !MIGRATION_TAG.test(tag)
    ) {
      throw new AppError('CONFIG_INVALID', 'Một mục trong journal migration sai định dạng.');
    }
    return { idx, when, tag };
  });
  return entries.sort((a, b) => a.idx - b.idx);
}

/** Số của migration cuối trong mã, ví dụ `0028`. */
export function lastMigrationNumber(entries: MigrationEntry[]): string {
  const last = entries[entries.length - 1];
  const match = last ? MIGRATION_TAG.exec(last.tag) : null;
  if (!match?.[1]) throw new AppError('CONFIG_INVALID', 'Không xác định được migration cuối.');
  return match[1];
}

export function expectedConfirmation(databaseName: string, entries: MigrationEntry[]): string {
  return `${databaseName}@${lastMigrationNumber(entries)}`;
}

/**
 * Logic chọn migration chờ của drizzle: so `created_at` của dòng đã áp MỚI NHẤT với `when` của từng mục.
 * `aheadOfCode`: DB đã áp migration mới hơn mọi thứ trong mã (chạy nhầm bản mã cũ) → phải dừng.
 */
export function planMigrations(
  entries: MigrationEntry[],
  lastAppliedAt: number | null,
): { pending: MigrationEntry[]; aheadOfCode: boolean } {
  const newest = Math.max(...entries.map((e) => e.when));
  if (lastAppliedAt !== null && lastAppliedAt > newest) return { pending: [], aheadOfCode: true };
  return {
    pending: entries.filter((e) => lastAppliedAt === null || e.when > lastAppliedAt),
    aheadOfCode: false,
  };
}

function parseAllowedHosts(raw: string | undefined): { host: string; port: string }[] {
  const items = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (items.length === 0) {
    throw new AppError(
      'CONFIG_INVALID',
      'Thiếu danh sách host DB staging được phép (CF_STAGING_DB_HOSTS).',
    );
  }
  return items.map((item) => {
    const [host, port, ...rest] = item.split(':');
    if (!host || !port || rest.length > 0 || !HOST_PATTERN.test(host) || !/^\d{1,5}$/.test(port)) {
      throw new AppError(
        'CONFIG_INVALID',
        'CF_STAGING_DB_HOSTS chỉ gồm các mục host:cổng (bắt buộc có cổng), cách nhau dấu phẩy, không dùng ký tự đại diện.',
      );
    }
    return { host, port };
  });
}

type ParsedTarget = { databaseName: string; host: string; port: string };

/** Tách host/cổng/tên DB từ URL; từ chối URL có thể bị hiểu khác nhau giữa các bộ phân tích. */
function parseAdminUrl(adminUrl: string | undefined): ParsedTarget {
  if (!adminUrl) {
    throw new AppError('CONFIG_INVALID', 'Thiếu chuỗi kết nối database (DATABASE_ADMIN_URL).');
  }
  const invalid = () =>
    new AppError('CONFIG_INVALID', 'Chuỗi kết nối database không đúng định dạng URL.');
  if ((adminUrl.match(/@/g) ?? []).length !== 1) throw invalid();
  let url: URL;
  try {
    url = new URL(adminUrl);
  } catch {
    throw invalid();
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') throw invalid();
  if (!url.port) {
    throw new AppError('CONFIG_INVALID', 'Chuỗi kết nối phải ghi cổng tường minh (host:cổng).');
  }
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode !== null && !SAFE_SSLMODES.has(sslmode)) {
    throw new AppError(
      'CONFIG_INVALID',
      'sslmode chỉ được là require, verify-ca hoặc verify-full.',
    );
  }
  for (const key of url.searchParams.keys()) {
    if (!SAFE_URL_PARAMS.has(key)) {
      throw new AppError(
        'CONFIG_INVALID',
        'Chuỗi kết nối chứa tham số không được phép (chỉ sslmode, connect_timeout, application_name).',
      );
    }
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw invalid();
  }
  const host = url.hostname.toLowerCase();
  if (!host || !HOST_PATTERN.test(host)) throw invalid();
  if (!DB_NAME_PATTERN.test(databaseName)) {
    throw new AppError(
      'CONFIG_INVALID',
      'Tên database trong chuỗi kết nối thiếu hoặc có ký tự lạ.',
    );
  }
  return { databaseName, host, port: url.port };
}

export type StagingMigrateInput = {
  appEnv: string | undefined;
  adminUrl: string | undefined;
  /** Giá trị CF_STAGING_DB_HOSTS. */
  allowedHosts: string | undefined;
  /** Giá trị CF_STAGING_DB_NAME: tên DB staging chính xác (không chỉ "không chứa prod"). */
  expectedDatabase: string | undefined;
  /** Giá trị GITHUB_ACTIONS. */
  githubActions: string | undefined;
  /** Giá trị GITHUB_WORKFLOW_REF. */
  workflowRef: string | undefined;
  /**
   * Giá trị CF_STAGING_SOLO_OPERATOR (SOLO-DEPLOY, Q-SOLO2): chỉ đúng chữ `true` mới bật. Dùng cho bản chạy thật cá nhân khi repo PUBLIC nên KHÔNG dùng runner GitHub tự host:
   * bỏ yêu cầu "đang ở workflow migrate-staging.yml trên GitHub Actions" và NGƯỢC LẠI mọi cổng khác giữ nguyên (APP_ENV=staging, production bị từ chối, đúng tên DB, host:cổng trong danh sách, mã xác nhận khi áp thật).
   */
  soloOperator?: string | undefined;
  /** Giá trị CF_CONFIRM_STAGING_MIGRATE. */
  confirmation: string | undefined;
  entries: MigrationEntry[];
  /** `false` chỉ cho `--dry-run` (không ghi gì). */
  requireConfirmation: boolean;
};

/**
 * Cổng cho migrate/queue:install lên staging. Trả về tên DB + host (host chỉ để so khớp, không in ra).
 * Thông báo lỗi KHÔNG chứa URL, người dùng, mật khẩu, host hay mã xác nhận đúng.
 */
export function assertStagingMigrateAllowed(input: StagingMigrateInput): {
  databaseName: string;
  host: string;
} {
  if (input.appEnv?.toLowerCase() === 'production' || input.appEnv?.toLowerCase() === 'prod') {
    throw new AppError('FORBIDDEN', 'Từ chối: production không có đường migrate bằng CLI này.');
  }
  if (input.appEnv !== 'staging') {
    throw new AppError('FORBIDDEN', 'Từ chối: APP_ENV phải đúng là "staging".');
  }
  // Chỉ chống chạy NHẦM từ máy dev/nhánh khác; kẻ sửa được workflow vẫn phải vượt pg_hba + secret của environment.
  // Chế độ người vận hành duy nhất (`soloOperator === 'true'`) thay lớp này bằng việc chạy TRÊN máy ảo với khóa admin chỉ nằm ở đó.
  const solo = input.soloOperator === 'true';
  if (
    !solo &&
    (input.githubActions !== 'true' || !input.workflowRef?.endsWith(ALLOWED_WORKFLOW_REF_SUFFIX))
  ) {
    throw new AppError(
      'FORBIDDEN',
      'Từ chối: chỉ chạy trong workflow migrate-staging.yml của nhánh main trên GitHub Actions.',
    );
  }
  if (!input.expectedDatabase || !DB_NAME_PATTERN.test(input.expectedDatabase)) {
    throw new AppError(
      'CONFIG_INVALID',
      'Thiếu hoặc sai CF_STAGING_DB_NAME (tên database staging).',
    );
  }
  const allowed = parseAllowedHosts(input.allowedHosts);
  const target = parseAdminUrl(input.adminUrl);
  if (
    /prod/i.test(target.databaseName) ||
    SYSTEM_DATABASES.has(target.databaseName.toLowerCase())
  ) {
    throw new AppError(
      'FORBIDDEN',
      'Từ chối: tên database trông như production hoặc database hệ thống.',
    );
  }
  if (target.databaseName !== input.expectedDatabase) {
    throw new AppError('FORBIDDEN', 'Từ chối: tên database trong URL khác CF_STAGING_DB_NAME.');
  }
  const hostOk = allowed.some((a) => a.host === target.host && a.port === target.port);
  if (!hostOk) {
    throw new AppError(
      'FORBIDDEN',
      'Từ chối: host:cổng database không nằm trong CF_STAGING_DB_HOSTS.',
    );
  }
  if (input.requireConfirmation) {
    if (
      !input.confirmation ||
      input.confirmation !== expectedConfirmation(target.databaseName, input.entries)
    ) {
      throw new AppError(
        'FORBIDDEN',
        `Từ chối: thiếu hoặc sai mã xác nhận CF_CONFIRM_STAGING_MIGRATE (định dạng ${CONFIRM_FORMAT}).`,
      );
    }
  }
  return { databaseName: target.databaseName, host: target.host };
}

export type AppliedMigrationRow = { hash: string; createdAt: number };
export type HashedMigrationEntry = MigrationEntry & { hash: string };

/**
 * Đối chiếu bảng `drizzle.__drizzle_migrations` với journal:
 *  - `gaps`: mục chưa áp nhưng `when` ≤ lần áp cuối (drizzle sẽ BỎ QUA vĩnh viễn → phải dừng);
 *  - `unknown`: dòng đã áp có hash không khớp mục nào trong mã (migration bị sửa sau khi áp, hoặc mã cũ hơn DB).
 */
export function verifyAppliedHashes(
  entries: HashedMigrationEntry[],
  applied: AppliedMigrationRow[],
): { gaps: string[]; unknown: number } {
  if (applied.length === 0) return { gaps: [], unknown: 0 };
  const appliedHashes = new Set(applied.map((r) => r.hash));
  const entryHashes = new Set(entries.map((e) => e.hash));
  const lastAppliedAt = Math.max(...applied.map((r) => r.createdAt));
  return {
    gaps: entries
      .filter((e) => !appliedHashes.has(e.hash) && e.when <= lastAppliedAt)
      .map((e) => e.tag),
    unknown: applied.filter((r) => !entryHashes.has(r.hash)).length,
  };
}
