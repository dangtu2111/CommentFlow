import { parseEnv } from '@flow/shared';
import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.enum(['dev', 'test', 'ci', 'staging', 'production']),
  /** Khóa ký cookie phiên. Đặt ở `.env.local` (máy code), KHÔNG nằm trên máy ảo (docs/13 §2). */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Địa chỉ gốc công khai của web; dùng dựng link trong thư. */
  BETTER_AUTH_URL: z.url(),
  /** Role cf_auth — chỉ module auth dùng; KHÔNG phải DATABASE_URL (cf_app). */
  DATABASE_AUTH_URL: z.string().min(1),
  /** Số proxy tin cậy đứng trước web (đọc X-Forwarded-For từ phải sang). 0 = không có proxy → không tin header. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_FROM: z.string().min(3),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  return parseEnv(envSchema, source);
}
