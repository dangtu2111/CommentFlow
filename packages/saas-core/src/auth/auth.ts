import { accounts, sessions, users, verifications } from '@flow/db/schema/core';
import { AppError, isLocale, type Locale } from '@flow/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { type Notifier, RESET_PASSWORD_HOURS, VERIFY_EMAIL_HOURS } from '../notify';
import { type AuthHandle, unwrapAuthDb } from './auth-db';
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
  /** Pool role cf_auth (`openAuthDb`): chỉ chạm users/sessions/accounts/verifications, trong ngữ cảnh app.ctx = 'auth'. */
  authDb: AuthHandle;
  /** Gửi thư xác minh / đặt lại mật khẩu / "đã có tài khoản" (SMTP ở production, bộ nhớ ở test). */
  notifier: Notifier;
  /** BETTER_AUTH_SECRET: khóa ký cookie phiên, chỉ ở env/secret manager, không bao giờ trong DB. */
  secret: string;
  baseURL: string;
  /**
   * Cookie `Secure`. Mặc định suy ra từ baseURL (https → bật). Bắt buộc bật ở staging/production:
   * tắt trong các môi trường đó là lỗi cấu hình.
   */
  secureCookies?: boolean;
  /** APP_ENV hiện tại — BẮT BUỘC: chỉ dev/test/ci được tắt cookie Secure; giá trị khác (kể cả lạ) phải Secure. */
  appEnv: AppEnv;
};

export type AppEnv = 'dev' | 'test' | 'ci' | 'staging' | 'production';
/** Môi trường được phép chạy cookie không Secure (http cục bộ). */
const INSECURE_COOKIE_ENVS: readonly string[] = ['dev', 'test', 'ci'];

/**
 * Better Auth theo ADR 003 (docs/decisions/003-auth-better-auth.md):
 * token phiên lưu thô + cookie ký HMAC, TẮT cookie cache, argon2id, phiên 14 ngày (Admin 8 giờ).
 * Phạm vi hiện tại: đăng ký, đăng nhập, quản lý phiên (email + mật khẩu).
 * Chưa làm (chừa chỗ, xem gap matrix): 2FA, rate limit đăng nhập, quên mật khẩu.
 * Hạn 8 giờ của phiên Admin được ÉP Ở DATABASE (trigger `core.cap_admin_session`, migration 0007) nên
 * đúng cho mọi đường, kể cả route `/api/auth/*` của Better Auth; `readSession()` chỉ là lớp thứ hai.
 */
export function createAuth(options: AuthOptions) {
  if (options.secret.length < MIN_SECRET_LENGTH) {
    throw new AppError(
      'CONFIG_INVALID',
      `BETTER_AUTH_SECRET phải có ít nhất ${MIN_SECRET_LENGTH} ký tự.`,
    );
  }

  const secureCookies = options.secureCookies ?? options.baseURL.startsWith('https://');
  // Danh sách cho phép (không phải danh sách cấm): thiếu/sai appEnv (ví dụ 'prod') vẫn bị chặn.
  if (!secureCookies && !INSECURE_COOKIE_ENVS.includes(options.appEnv)) {
    throw new AppError(
      'CONFIG_INVALID',
      'Cookie phiên phải bật Secure (baseURL https) trừ khi APP_ENV là dev/test/ci.',
    );
  }

  const appUrl = options.baseURL.replace(/\/+$/, '');
  const recipientOf = (user: { email: string; name: string; locale?: unknown }) => {
    const locale: Locale = isLocale(user.locale) ? user.locale : 'vi';
    return { email: user.email, name: user.name, locale };
  };

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    // Pool role cf_auth: mọi kết nối mở với app.ctx = 'auth' (cần cả role lẫn ngữ cảnh mới vào được bảng xác thực).
    database: drizzleAdapter(unwrapAuthDb(options.authDb).db, {
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
      // Chưa xác minh email thì không đăng nhập được; đăng ký trùng email trả phản hồi y như đăng ký mới
      // (Better Auth làm vậy khi requireEmailVerification bật) và gọi onExistingUserSignUp bên dưới.
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_HOURS * 3600,
      // Gửi KHÔNG chờ: thời gian phản hồi không phụ thuộc email có tồn tại hay không.
      sendResetPassword: async ({ user, url }) => {
        options.notifier.sendInBackground(recipientOf(user), { kind: 'reset-password', url });
      },
      onExistingUserSignUp: async ({ user }) => {
        options.notifier.sendInBackground(recipientOf(user), {
          kind: 'account-exists',
          loginUrl: `${appUrl}/login`,
          resetUrl: `${appUrl}/forgot-password`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: VERIFY_EMAIL_HOURS * 3600,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        options.notifier.sendInBackground(recipientOf(user), { kind: 'verify-email', url });
      },
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
        // Cho nhận từ form đăng ký (nơi gọi phải kiểm vi|en; DB cũng có CHECK).
        locale: { type: 'string', required: false, defaultValue: 'vi', input: true },
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
