import {
  AppError,
  type BrandConfig,
  defaultMailFrom,
  loadBrandConfig,
  parseEnv,
} from '@flow/shared';
import { z } from 'zod';

const envSchema = z
  .object({
    APP_ENV: z.enum(['dev', 'test', 'ci', 'staging', 'production']),
    /** Khóa ký cookie phiên. Đặt ở `.env.local` (máy code), KHÔNG nằm trên máy ảo (docs/13 §2). */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** Địa chỉ gốc công khai của web; dùng dựng link trong thư. */
    BETTER_AUTH_URL: z.url(),
    /** Role cf_auth — chỉ module auth dùng; KHÔNG phải DATABASE_URL (cf_app). */
    DATABASE_AUTH_URL: z.string().min(1),
    /** Role cf_app — đọc vai trò workspace (để biết ai bắt buộc 2FA); chịu RLS như mọi truy vấn nghiệp vụ. */
    DATABASE_URL: z.string().min(1),
    /** Valkey cho rate limit (khóa `sys:rl:…`, ADR 004). */
    REDIS_URL: z.string().min(1),
    /** Tiền tố khóa của môi trường (`dev:`, `ci:`…); khóa của dev luôn có tiền tố. */
    REDIS_KEY_PREFIX: z.string().default(''),
    /**
     * Nguồn IP khách (ADR 004 §2): `none` (mặc định; dev/LAN) hoặc `cf-connecting-ip` (CHỈ khi APP_ENV=staging, phía sau
     * Cloudflare Tunnel và cổng web không truy cập được trực tiếp).
     */
    CLIENT_IP_SOURCE: z.enum(['none', 'cf-connecting-ip']).default('none'),
    /** Kiểm mật khẩu lộ bằng Have I Been Pwned (ADR 004 §3). `off` chỉ cho dev/test/ci (dev không ra internet); luôn còn danh sách cục bộ. */
    PWNED_CHECK: z.enum(['on', 'off']).default('on'),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    /** Người gửi thư; bỏ trống → dựng từ `APP_EMAIL_FROM`/`APP_NAME`+`APP_DOMAIN` (FR-125). */
    SMTP_FROM: z.string().min(3).optional(),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.PWNED_CHECK === 'off' && !['dev', 'test', 'ci'].includes(env.APP_ENV)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PWNED_CHECK'],
        message: 'PWNED_CHECK=off chỉ được dùng khi APP_ENV là dev/test/ci',
      });
    }
    // Tin CF-Connecting-IP ở môi trường không đứng sau Cloudflare cho phép client tự đặt IP để vượt rate limit.
    if (env.CLIENT_IP_SOURCE === 'cf-connecting-ip' && env.APP_ENV !== 'staging') {
      ctx.addIssue({
        code: 'custom',
        path: ['CLIENT_IP_SOURCE'],
        message: 'cf-connecting-ip chỉ được dùng khi APP_ENV=staging',
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema> & {
  /** Thương hiệu cấu hình được (FR-125): `APP_NAME`, `APP_LOGO_URL`, `APP_DOMAIN`, `APP_EMAIL_FROM`. */
  brand: BrandConfig;
  /** Địa chỉ gửi thư: `SMTP_FROM` nếu có, không thì `APP_EMAIL_FROM` / `Tên <no-reply@APP_DOMAIN>`. */
  mailFrom: string;
};

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const brand = loadBrandConfig(source);
  const env = parseEnv(envSchema, source);
  const mailFrom = env.SMTP_FROM ?? defaultMailFrom(brand);
  if (!mailFrom) {
    throw new AppError(
      'CONFIG_INVALID',
      'Cấu hình môi trường không hợp lệ: SMTP_FROM (hoặc APP_EMAIL_FROM / APP_DOMAIN)',
    );
  }
  return { ...env, brand, mailFrom };
}

const webhookEnvSchema = z.object({
  /** Role cf_app (ghi sự kiện qua hàm DEFINER, gửi job). */
  DATABASE_URL: z.string().min(1),
  /** App Secret của Meta (xác minh `X-Hub-Signature-256`). Chưa đặt → endpoint trả 503, không bao giờ chấp nhận. */
  META_APP_SECRET: z.string().trim().min(16).optional(),
  /** Chuỗi tự chọn để Meta xác minh endpoint (bắt tay GET). Chưa đặt → 503. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().trim().min(16).optional(),
});

export type WebhookEnv = {
  databaseUrl: string;
  appSecret: string | undefined;
  verifyToken: string | undefined;
};

/** Cấu hình riêng cho endpoint webhook (không đòi SMTP/Redis...). Giá trị rỗng/chỉ khoảng trắng coi như chưa đặt. */
export function loadWebhookEnv(
  source: Record<string, string | undefined> = process.env,
): WebhookEnv {
  const blank = (value: string | undefined) => (value?.trim() ? value : undefined);
  const env = parseEnv(webhookEnvSchema, {
    DATABASE_URL: source.DATABASE_URL,
    META_APP_SECRET: blank(source.META_APP_SECRET),
    META_WEBHOOK_VERIFY_TOKEN: blank(source.META_WEBHOOK_VERIFY_TOKEN),
  });
  return {
    databaseUrl: env.DATABASE_URL,
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
  };
}
