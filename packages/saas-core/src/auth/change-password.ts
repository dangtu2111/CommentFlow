import { AppError } from '@flow/shared';
import type { RateLimiter } from '../ratelimit';
import { type Auth, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './auth';
import type { AuthHandle } from './auth-db';
import type { PasswordPolicy } from './password-policy';
import { changePasswordAndRevokeAll } from './revoke';

/**
 * Kết quả đổi mật khẩu. `ok` nghĩa là MỌI phiên (kể cả phiên hiện tại) đã bị xóa — nơi gọi phải đưa về /login.
 * `invalid.reason` trùng với `FieldProblem.reason` của luồng đăng ký/đặt lại để dùng chung chuỗi giao diện.
 */
export type ChangePasswordResult =
  | { status: 'ok' }
  | { status: 'unauthenticated' }
  | { status: 'wrong_password' }
  | { status: 'same_password' }
  | { status: 'invalid'; reason: 'too_short' | 'too_long' | 'common' | 'pwned' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

type ChangeAndRevoke = (input: {
  headers: Headers;
  currentPassword: string;
  newPassword: string;
}) => Promise<void>;

const statusOf = (error: unknown): number | undefined => {
  const e = error as { status?: unknown; statusCode?: unknown };
  const raw = typeof e?.statusCode === 'number' ? e.statusCode : e?.status;
  return typeof raw === 'number' ? raw : undefined;
};

/**
 * Đổi mật khẩu của CHÍNH người đang đăng nhập (docs/13 §2). Thứ tự (mỗi bước chặn thì không chạy bước sau):
 *  1) có phiên; 2) độ dài + trùng mật khẩu cũ (không tốn lượt, không gọi mạng);
 *  3) rate limit `reauth` theo userId (cùng bộ đếm với bật/tắt 2FA: phiên bị đánh cắp không dò được mật khẩu);
 *  4) `passwordPolicy` (AUTH-PWNED) — SAU cổng rate limit để không thành máy gọi HIBP không giới hạn;
 *  5) `changePasswordAndRevokeAll` (Better Auth tự kiểm mật khẩu hiện tại bằng argon2id).
 * Chỉ thành công mới xóa bộ đếm. Mật khẩu không bao giờ được log hay đưa vào lỗi.
 */
export function createChangePasswordFlow(options: {
  auth: Auth;
  authDb: AuthHandle;
  limiter: RateLimiter;
  passwordPolicy: PasswordPolicy;
  /** Chỉ để test; mặc định `changePasswordAndRevokeAll`. */
  changeAndRevoke?: ChangeAndRevoke;
}) {
  const { auth, authDb, limiter, passwordPolicy } = options;
  const changeAndRevoke: ChangeAndRevoke =
    options.changeAndRevoke ?? ((input) => changePasswordAndRevokeAll(auth, authDb, input));

  return {
    async changePassword(input: {
      headers: Headers;
      currentPassword: string;
      newPassword: string;
    }): Promise<ChangePasswordResult> {
      const current = await auth.api.getSession({ headers: input.headers });
      if (!current) return { status: 'unauthenticated' };
      const userId = current.user.id;

      if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
        return { status: 'invalid', reason: 'too_short' };
      }
      if (input.newPassword.length > MAX_PASSWORD_LENGTH) {
        return { status: 'invalid', reason: 'too_long' };
      }
      if (input.currentPassword.length > MAX_PASSWORD_LENGTH) return { status: 'wrong_password' };
      if (input.newPassword === input.currentPassword) return { status: 'same_password' };

      const gate = await limiter.check('reauth', { userId });
      if (!gate.allowed) {
        return { status: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds };
      }

      const verdict = await passwordPolicy.check(input.newPassword);
      if (!verdict.ok) return { status: 'invalid', reason: verdict.reason };

      try {
        await changeAndRevoke(input);
      } catch (error) {
        const status = statusOf(error);
        if (status === 400 || status === 401 || status === 403) return { status: 'wrong_password' };
        throw new AppError('INTERNAL', 'Không đổi được mật khẩu.', { cause: error });
      }
      await limiter.reset('reauth', { userId });
      return { status: 'ok' };
    },
  };
}

export type ChangePasswordFlow = ReturnType<typeof createChangePasswordFlow>;
