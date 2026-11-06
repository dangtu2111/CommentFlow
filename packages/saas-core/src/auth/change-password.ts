import { AppError } from '@flow/shared';
import type { RateLimiter } from '../ratelimit';
import { type Auth, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './auth';
import type { AuthHandle } from './auth-db';
import type { PasswordPolicy } from './password-policy';
import { revokeAllSessionsOfUser } from './revoke';

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

type ChangeInput = { headers: Headers; currentPassword: string; newPassword: string };

type ApiError = { status?: unknown; statusCode?: unknown; body?: { code?: unknown } };

const statusOf = (error: unknown): number | undefined => {
  const e = error as ApiError;
  const raw = typeof e?.statusCode === 'number' ? e.statusCode : e?.status;
  return typeof raw === 'number' ? raw : undefined;
};
const codeOf = (error: unknown): string | undefined => {
  const code = (error as ApiError)?.body?.code;
  return typeof code === 'string' ? code : undefined;
};

/**
 * Đổi mật khẩu của CHÍNH người đang đăng nhập (docs/13 §2). Thứ tự (mỗi bước chặn thì không chạy bước sau):
 *  1) có phiên; 2) độ dài + trùng mật khẩu cũ (không tốn lượt, không gọi mạng);
 *  3) rate limit `reauth` theo userId (cùng bộ đếm với bật/tắt 2FA: phiên bị đánh cắp không dò được mật khẩu);
 *  4) `passwordPolicy` (AUTH-PWNED) — SAU cổng rate limit để không thành máy gọi HIBP không giới hạn;
 *  5) Better Auth `changePassword` (tự kiểm mật khẩu hiện tại bằng argon2id) rồi xóa MỌI phiên.
 * Chỉ thành công mới xóa bộ đếm. Mật khẩu không bao giờ được log hay đưa vào lỗi.
 */
export function createChangePasswordFlow(options: {
  auth: Auth;
  authDb: AuthHandle;
  limiter: RateLimiter;
  passwordPolicy: PasswordPolicy;
  /** Chỉ để test; mặc định gọi Better Auth `changePassword`. */
  changeCredential?: (input: ChangeInput) => Promise<void>;
  /** Chỉ để test; mặc định `revokeAllSessionsOfUser`. */
  revokeAll?: (userId: string) => Promise<unknown>;
  /** Gọi SAU khi đổi xong (gửi email báo). Lỗi của hook bị nuốt có chủ đích: mật khẩu đã đổi, không được báo "chưa đổi". */
  onChanged?: (user: { id: string; email: string; name: string; locale: string | null }) => void;
}) {
  const { auth, authDb, limiter, passwordPolicy } = options;
  const changeCredential =
    options.changeCredential ??
    (async (input: ChangeInput) => {
      await auth.api.changePassword({
        headers: input.headers,
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: true,
        },
      });
    });
  const revokeAll =
    options.revokeAll ?? ((userId: string) => revokeAllSessionsOfUser(authDb, userId));

  return {
    async changePassword(input: ChangeInput): Promise<ChangePasswordResult> {
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
        await changeCredential(input);
      } catch (error) {
        const status = statusOf(error);
        if (status === 401) return { status: 'unauthenticated' };
        if (codeOf(error) === 'INVALID_PASSWORD') return { status: 'wrong_password' };
        // Chỉ tên lớp + mã: thông báo gốc có thể chứa tham số truy vấn (băm mật khẩu).
        throw new AppError('INTERNAL', 'Không đổi được mật khẩu.', {
          cause: { name: (error as Error)?.name, status, code: codeOf(error) },
        });
      }
      // Mật khẩu ĐÃ đổi: lỗi xóa phiên không được báo như "chưa đổi" (người dùng sẽ thử lại và bị báo sai mật khẩu).
      // Thử lại một lần; vẫn hỏng thì ghi cảnh báo (chỉ userId) và coi như xong — người dùng vẫn bị đưa về /login.
      try {
        await revokeAll(userId);
      } catch {
        try {
          await revokeAll(userId);
        } catch {
          console.warn(JSON.stringify({ event: 'change_password_revoke_failed', userId }));
        }
      }
      await limiter.reset('reauth', { userId });
      try {
        const { email, name } = current.user;
        const locale = (current.user as { locale?: unknown }).locale;
        options.onChanged?.({
          id: userId,
          email,
          name,
          locale: typeof locale === 'string' ? locale : null,
        });
      } catch {
        console.warn(JSON.stringify({ event: 'change_password_notify_failed', userId }));
      }
      return { status: 'ok' };
    },
  };
}

export type ChangePasswordFlow = ReturnType<typeof createChangePasswordFlow>;
