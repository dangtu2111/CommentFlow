import { AppError } from '@flow/shared';

// Hàm THUẦN cho đường migrate/cài hàng đợi lên staging (không chạm DB, dễ unit test).
// `migration-guard.ts` (dev/test/ci) giữ nguyên và vẫn từ chối staging/production.
// Production KHÔNG có đường chạy bằng CLI: mọi cổng dưới đây từ chối cứng, không có cờ nào mở.

export type MigrationEntry = { idx: number; when: number; tag: string };

/** Tham số URL an toàn; mọi tham số khác (host, dbname, options…) bị từ chối vì có thể đổi đích kết nối. */
const SAFE_URL_PARAMS = new Set(['sslmode', 'connect_timeout', 'application_name']);
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

function parseAllowedHosts(raw: string | undefined): { host: string; port?: string }[] {
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
    if (
      !host ||
      rest.length > 0 ||
      !HOST_PATTERN.test(host) ||
      (port !== undefined && !/^\d{1,5}$/.test(port))
    ) {
      throw new AppError(
        'CONFIG_INVALID',
        'CF_STAGING_DB_HOSTS chỉ gồm host hoặc host:cổng, cách nhau dấu phẩy (không dùng ký tự đại diện).',
      );
    }
    return port === undefined ? { host } : { host, port };
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
  return { databaseName, host, port: url.port || '5432' };
}

export type StagingMigrateInput = {
  appEnv: string | undefined;
  adminUrl: string | undefined;
  /** Giá trị CF_STAGING_DB_HOSTS. */
  allowedHosts: string | undefined;
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
  const hostOk = allowed.some(
    (a) => a.host === target.host && (a.port === undefined || a.port === target.port),
  );
  if (!hostOk) {
    throw new AppError('FORBIDDEN', 'Từ chối: host database không nằm trong CF_STAGING_DB_HOSTS.');
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
