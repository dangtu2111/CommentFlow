import type { FlowDb } from '@flow/db';
import { accounts, sessions, users, verifications } from '@flow/db/schema/core';
import { AppError } from '@flow/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { hashPassword, verifyPassword } from './password';
import {
  APP_SESSION_SECONDS,
  capSessionExpiry,
  SESSION_UPDATE_AGE_SECONDS,
} from './session-policy';

/** Mật khẩu tối thiểu 10 ký tự (docs/13 §2); trần 128 để chặn tấn công tốn CPU bằng mật khẩu khổng lồ. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
const MIN_SECRET_LENGTH = 32;

export type AuthOptions = {
  db: FlowDb;
  /** BETTER_AUTH_SECRET: khóa ký cookie phiên, chỉ ở env/secret manager, không bao giờ trong DB. */
  secret: string;
  baseURL: string;
  /**
   * Cookie `Secure`. Mặc định suy ra từ baseURL (https → bật). Bắt buộc bật ở staging/production:
   * tắt trong các môi trường đó là lỗi cấu hình.
   */
  secureCookies?: boolean;
  /** APP_ENV hiện tại (dev | test | ci | staging | production) để áp luật cookie Secure. */
  appEnv?: string;
};

/**
 * Better Auth theo ADR 003 (docs/decisions/003-auth-better-auth.md):
 * token phiên lưu thô + cookie ký HMAC, TẮT cookie cache, argon2id, phiên 14 ngày (Admin 8 giờ).
 * Phạm vi hiện tại: đăng ký, đăng nhập, quản lý phiên (email + mật khẩu).
 * Chưa làm (chừa chỗ, xem gap matrix): 2FA, rate limit đăng nhập, quên mật khẩu.
 * Đọc phiên: dùng `readSession()` (session.ts), KHÔNG gọi `auth.api.getSession` trực tiếp ở nơi khác —
 * hạn cứng 8 giờ của phiên Admin được áp ở đó.
 */
export function createAuth(options: AuthOptions) {
  if (options.secret.length < MIN_SECRET_LENGTH) {
    throw new AppError(
      'CONFIG_INVALID',
      `BETTER_AUTH_SECRET phải có ít nhất ${MIN_SECRET_LENGTH} ký tự.`,
    );
  }

  const secureCookies = options.secureCookies ?? options.baseURL.startsWith('https://');
  if (!secureCookies && (options.appEnv === 'staging' || options.appEnv === 'production')) {
    throw new AppError(
      'CONFIG_INVALID',
      'Cookie phiên phải bật Secure ở staging/production (baseURL cần là https).',
    );
  }

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    // Chỉ dùng đường "system": các bảng xác thực không có RLS theo workspace.
    database: drizzleAdapter(options.db.system, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword({ hash, password }),
      },
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: APP_SESSION_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      // Tắt cookie cache để thu hồi phiên có hiệu lực ngay (ADR 003).
      cookieCache: { enabled: false },
      additionalFields: {
        isAdminSession: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    user: {
      additionalFields: {
        locale: { type: 'string', required: false, defaultValue: 'vi', input: false },
        isAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
        adminRole: { type: 'string', required: false, input: false },
        totpEnabled: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    advanced: {
      // Để Postgres sinh uuid bằng gen_random_uuid() (docs/10 §1).
      database: { generateId: false },
      useSecureCookies: secureCookies,
    },
    databaseHooks: {
      session: {
        create: {
          // Phiên Admin hết hạn sau 8 giờ; không bao giờ kéo dài hạn đã tính.
          before: async (session) => ({
            data: {
              ...session,
              expiresAt: capSessionExpiry({
                expiresAt: session.expiresAt,
                isAdminSession: (session as { isAdminSession?: boolean }).isAdminSession === true,
                now: new Date(),
              }),
            },
          }),
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
