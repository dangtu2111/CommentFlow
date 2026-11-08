import { AppError } from '@flow/shared';
import type pg from 'pg';

/**
 * Lõi lệnh ghi feature flag cho DEV/TEST/CI (`pnpm flags:set`). Trang Admin "Feature flags" (ADMIN-FLAGS-PAGE, FR-117) CHƯA có, nên tạm ghi bằng khóa
 * admin — CHỈ trên database `cf_dev`/`cf_test*`/`cf_ci` và APP_ENV không phải staging/production. Staging/production KHÔNG đi đường này (kill switch ở đó
 * phải qua trang Admin: chỉ Super Admin + 2FA, ghi `action_logs`, NOTIFY có hiệu lực ngay).
 */
export type FlagChange = {
  key: string;
  enabled: boolean;
  /** `null` = toàn hệ thống (đổi `default_on`); có giá trị = override theo workspace. */
  workspaceId: string | null;
  kind: FlagKindArg;
  reason: string | null;
};

const KINDS = ['ops', 'release', 'kill_switch'] as const;
type FlagKindArg = (typeof KINDS)[number];

const KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DB = /^cf_(dev|test(_[a-z0-9]+)*|ci)$/;
const USAGE =
  'Cách dùng: flags:set -- <khóa> on|off [--workspace <uuid>] [--kind ops|release|kill_switch] [--reason "lý do"]';

export function parseFlagsArgs(argv: readonly string[]): FlagChange {
  const args = argv.filter((a) => a !== '--');
  const [key, value, ...rest] = args;
  if (!key || !KEY.test(key) || (value !== 'on' && value !== 'off')) {
    throw new AppError('VALIDATION_FAILED', USAGE);
  }
  const change: FlagChange = {
    key,
    enabled: value === 'on',
    workspaceId: null,
    kind: 'ops',
    reason: null,
  };
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i];
    const arg = rest[i + 1];
    if (arg === undefined) throw new AppError('VALIDATION_FAILED', USAGE);
    if (name === '--workspace') {
      if (!UUID.test(arg))
        throw new AppError('VALIDATION_FAILED', 'Giá trị --workspace không hợp lệ (cần UUID).');
      change.workspaceId = arg;
    } else if (name === '--kind') {
      if (!(KINDS as readonly string[]).includes(arg)) {
        throw new AppError('VALIDATION_FAILED', `Giá trị --kind không hợp lệ. ${USAGE}`);
      }
      change.kind = arg as FlagKindArg;
    } else if (name === '--reason') {
      change.reason = arg.slice(0, 200);
    } else {
      throw new AppError('VALIDATION_FAILED', USAGE);
    }
  }
  return change;
}

/** Chặn chạy ngoài dev/test/ci: kiểm tên database của URL admin và APP_ENV. Không in URL. */
export function assertFlagsDatabase(
  adminUrl: string | undefined,
  appEnv: string | undefined,
): void {
  if (!adminUrl) throw new AppError('CONFIG_INVALID', 'Thiếu DATABASE_ADMIN_URL.');
  if (appEnv === 'staging' || appEnv === 'production') {
    throw new AppError(
      'CONFIG_INVALID',
      `APP_ENV=${appEnv}: lệnh ghi cờ này chỉ cho dev/test/ci; staging/production dùng trang Admin (ADMIN-FLAGS-PAGE).`,
    );
  }
  let name: string;
  try {
    name = decodeURIComponent(new URL(adminUrl).pathname.replace(/^\//, ''));
  } catch {
    throw new AppError('CONFIG_INVALID', 'DATABASE_ADMIN_URL không đúng định dạng URL.');
  }
  if (!ALLOWED_DB.test(name)) {
    throw new AppError(
      'CONFIG_INVALID',
      `Chỉ ghi cờ trên database cf_dev, cf_test* hoặc cf_ci (đang trỏ "${name}").`,
    );
  }
}

/**
 * Ghi một thay đổi cờ (idempotent). Cờ chưa có hàng → tạo (product `commentflow`; `release` đặt hạn 30 ngày). Toàn hệ thống → `default_on`;
 * theo workspace → override. Trigger DB bắn `NOTIFY flags_changed` nên tiến trình đang chạy nhận ngay.
 */
export async function applyFlagChange(pool: pg.Pool, change: FlagChange): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO core.feature_flags (key, product, description, kind, default_on, expires_at)
       VALUES ($1, 'commentflow', $2, $3, false, CASE WHEN $3 = 'release' THEN now() + interval '30 days' END)
       ON CONFLICT (key) DO NOTHING`,
      [change.key, 'Tạo bằng flags:set (dev/test/ci)', change.kind],
    );
    if (change.workspaceId === null) {
      await client.query(
        'UPDATE core.feature_flags SET default_on = $2, updated_at = now() WHERE key = $1',
        [change.key, change.enabled],
      );
    } else {
      await client.query(
        `INSERT INTO core.feature_flag_overrides (flag_key, workspace_id, enabled, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (flag_key, workspace_id) DO UPDATE SET enabled = EXCLUDED.enabled, reason = EXCLUDED.reason`,
        [change.key, change.workspaceId, change.enabled, change.reason],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
