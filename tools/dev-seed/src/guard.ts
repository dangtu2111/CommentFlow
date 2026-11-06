import { AppError } from '@flow/shared';

/**
 * Chặn dữ liệu mẫu chạy nhầm lên môi trường thật (Q-UIF1). Chỉ cho khi APP_ENV là `dev` VÀ cả ba chuỗi kết nối
 * (admin, web, worker) cùng trỏ database `cf_dev` — không cho cả `cf_test`/`cf_ci`/làn song song (khác `migration-guard`).
 * Thông báo lỗi không bao giờ chứa mật khẩu/URL.
 */
export const SEED_ENV = 'dev';
export const SEED_DATABASE = 'cf_dev';
/** Dấu `ALTER DATABASE … SET cf.env = '…'` của DB thật; có dấu này là staging/production → từ chối. */
export const FORBIDDEN_DB_MARKERS = ['staging', 'production'];

export type SeedGuardInput = {
  appEnv: string | undefined;
  adminUrl: string | undefined;
  appUrl: string | undefined;
  workerUrl: string | undefined;
};

function databaseNameOf(url: string | undefined, variable: string): string {
  if (!url) throw new AppError('CONFIG_INVALID', `Thiếu chuỗi kết nối database (${variable}).`);
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new AppError('CONFIG_INVALID', `${variable} không đúng định dạng URL.`);
  }
}

/** Trả về tên database (luôn là `cf_dev`) hoặc ném `FORBIDDEN`/`CONFIG_INVALID`. */
export function assertDevSeedAllowed(input: SeedGuardInput): string {
  if (input.appEnv !== SEED_ENV) {
    throw new AppError(
      'FORBIDDEN',
      `Từ chối dữ liệu mẫu: APP_ENV phải đúng là "${SEED_ENV}" (đang là "${input.appEnv ?? ''}").`,
    );
  }
  const targets = [
    ['DATABASE_ADMIN_URL', input.adminUrl],
    ['DATABASE_URL', input.appUrl],
    ['DATABASE_WORKER_URL', input.workerUrl],
  ] as const;
  for (const [variable, url] of targets) {
    const name = databaseNameOf(url, variable);
    if (name !== SEED_DATABASE) {
      throw new AppError(
        'FORBIDDEN',
        `Từ chối dữ liệu mẫu: ${variable} trỏ database "${name}", chỉ được "${SEED_DATABASE}".`,
      );
    }
  }
  return SEED_DATABASE;
}

/** Kiểm lần hai bằng chính DB đang kết nối (`current_database()` + `current_setting('cf.env', true)`). */
export function assertDbMarkerAllowed(input: {
  database: string;
  marker: string | null | undefined;
}): void {
  if (input.database !== SEED_DATABASE) {
    throw new AppError(
      'FORBIDDEN',
      `Từ chối dữ liệu mẫu: database thật sự đang kết nối là "${input.database}", chỉ được "${SEED_DATABASE}".`,
    );
  }
  const marker = input.marker?.trim().toLowerCase() ?? '';
  if (FORBIDDEN_DB_MARKERS.includes(marker)) {
    throw new AppError(
      'FORBIDDEN',
      `Từ chối dữ liệu mẫu: database có dấu cf.env = "${marker}" (môi trường thật).`,
    );
  }
}
