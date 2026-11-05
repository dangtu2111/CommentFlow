import { parseEnv } from '@flow/shared';
import { z } from 'zod';

/** Tên role đăng nhập của worker — khớp migration 0030 (`session_user = 'cf_worker'`). */
const WORKER_ROLE = 'cf_worker';

function isWorkerRoleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    // `?user=` ghi đè tên trong URL ở thư viện pg → từ chối để khỏi kết nối nhầm role.
    return decodeURIComponent(url.username) === WORKER_ROLE && !url.searchParams.has('user');
  } catch {
    return false;
  }
}

const envSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WORKER_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  /**
   * Chuỗi kết nối role worker (`cf_worker`, migration 0030): đường DUY NHẤT được coi là "hệ thống" và đọc được ciphertext
   * token (ADR 011). KHÔNG phải DATABASE_URL (cf_app, của web) hay DATABASE_ADMIN_URL. Chỉ kiểm tên người dùng ở đây
   * (thông báo lỗi không kèm giá trị để khỏi lộ mật khẩu).
   */
  DATABASE_WORKER_URL: z
    .string()
    .min(1)
    .refine(isWorkerRoleUrl, 'phải đăng nhập bằng role cf_worker'),
  /** `v1:<64 hex>,v2:<…>` (docs/13 §5). Chưa cần khi chưa có kênh nào có token; có kênh mà thiếu → worker không khởi động. */
  TOKEN_ENC_KEYS: z.string().optional(),
});

export type WorkerConfig = {
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  port: number;
  databaseUrl: string;
  tokenEncKeys: string | undefined;
};

export function loadConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
  const env = parseEnv(envSchema, source);
  return {
    logLevel: env.LOG_LEVEL,
    port: env.WORKER_PORT,
    databaseUrl: env.DATABASE_WORKER_URL,
    tokenEncKeys: env.TOKEN_ENC_KEYS,
  };
}
