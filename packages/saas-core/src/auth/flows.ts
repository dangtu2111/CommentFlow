import { AppError, isLocale, type Locale } from '@flow/shared';
import { z } from 'zod';
import type { Auth } from './auth';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './auth';
import { type CookieSpec, cookiesFromResponse } from './cookies';

/**
 * Các luồng đăng ký / đăng nhập / quên mật khẩu cho giao diện. Mọi kết quả đều TRUNG TÍNH về việc email có
 * tồn tại hay không (docs/08 §6, 13 §2): cùng trạng thái, cùng nội dung cho email lạ và email có thật.
 * Giao diện chỉ làm việc với các kết quả dưới đây — không bao giờ thấy mã lỗi thô của Better Auth.
 */

export type FieldProblem = {
  field: 'email' | 'password' | 'name';
  reason: 'invalid' | 'too_short' | 'too_long';
};

export type RegisterResult =
  | { status: 'check_email' }
  | { status: 'invalid'; problem: FieldProblem };

export type SignInResult =
  | { status: 'ok'; cookies: CookieSpec[]; locale: Locale }
  | { status: 'invalid_credentials' }
  | { status: 'email_not_verified' }
  /** Chừa chỗ cho nhánh 2FA: chưa có đường nào sinh ra kết quả này. */
  | { status: 'two_factor_required' }
  /** Chừa chỗ cho nhánh rate limit: sinh ra khi `loginGate` từ chối. */
  | { status: 'rate_limited'; retryAfterSeconds?: number }
  | { status: 'invalid'; problem: FieldProblem };

export type ForgotResult =
  | { status: 'sent_if_exists' }
  | { status: 'invalid'; problem: FieldProblem };
export type ResendResult = ForgotResult;

export type ResetResult =
  | { status: 'ok' }
  | { status: 'invalid_token' }
  | { status: 'invalid'; problem: FieldProblem };

/** Cổng chặn trước khi thử đăng nhập. Hiện luôn cho qua; nhánh rate limit gắn Valkey vào đây. */
export type LoginGate = (input: {
  email: string;
  ip?: string;
}) => Promise<{ allowed: true } | { allowed: false; retryAfterSeconds?: number }>;

const allowAll: LoginGate = async () => ({ allowed: true });

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const nameSchema = z.string().trim().min(1).max(80);
const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

function checkEmail(
  value: string,
): { ok: true; value: string } | { ok: false; problem: FieldProblem } {
  const parsed = emailSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problem: { field: 'email', reason: 'invalid' } };
}

function checkPassword(value: string): FieldProblem | null {
  if (value.length < MIN_PASSWORD_LENGTH) return { field: 'password', reason: 'too_short' };
  if (value.length > MAX_PASSWORD_LENGTH) return { field: 'password', reason: 'too_long' };
  return passwordSchema.safeParse(value).success ? null : { field: 'password', reason: 'invalid' };
}

/** Better Auth ném APIError có `status` (HTTP) — đọc an toàn, không import kiểu nội bộ. */
function statusOf(error: unknown): number | undefined {
  const e = error as { status?: unknown; statusCode?: unknown };
  const raw = typeof e?.statusCode === 'number' ? e.statusCode : e?.status;
  return typeof raw === 'number' ? raw : undefined;
}

export function createAuthFlows(options: {
  auth: Auth;
  /** Địa chỉ gốc của web (ví dụ http://localhost:3000) — dùng cho các đường dẫn quay lại sau khi bấm link trong thư. */
  appUrl?: string;
  loginGate?: LoginGate;
  /**
   * Thời gian phản hồi tối thiểu (ms) của các luồng có thể lộ "email có tồn tại không" qua thời gian
   * (đăng ký, gửi lại thư, quên mật khẩu): email mới phải ghi DB + ký token, email đã có thì không — nên
   * chờ cho đủ ngưỡng này (cộng một ít ngẫu nhiên) rồi mới trả. Mặc định 600; đặt 0 để tắt (test).
   */
  minResponseMs?: number;
}) {
  const { auth } = options;
  const loginGate = options.loginGate ?? allowAll;
  const minResponseMs = options.minResponseMs ?? 600;

  const padded =
    <Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) =>
    async (...args: Args): Promise<Result> => {
      const startedAt = Date.now();
      try {
        return await run(...args);
      } finally {
        const jitter = Math.random() * Math.min(100, minResponseMs / 6);
        const wait = minResponseMs + jitter - (Date.now() - startedAt);
        if (minResponseMs > 0 && wait > 0)
          await new Promise((resolve) => setTimeout(resolve, wait));
      }
    };

  const flows = {
    /**
     * Đăng ký. Email mới → gửi thư xác minh; email đã có → Better Auth trả phản hồi y hệt và gửi thư "đã có tài
     * khoản" cho chủ email. Giao diện luôn chuyển sang "Kiểm tra email".
     */
    async register(input: {
      email: string;
      password: string;
      name: string;
      locale: string;
    }): Promise<RegisterResult> {
      const email = checkEmail(input.email);
      if (!email.ok) return { status: 'invalid', problem: email.problem };
      const name = nameSchema.safeParse(input.name);
      if (!name.success)
        return { status: 'invalid', problem: { field: 'name', reason: 'invalid' } };
      const passwordProblem = checkPassword(input.password);
      if (passwordProblem) return { status: 'invalid', problem: passwordProblem };
      const locale: Locale = isLocale(input.locale) ? input.locale : 'vi';

      try {
        await auth.api.signUpEmail({
          body: {
            email: email.value,
            password: input.password,
            name: name.data,
            locale,
            callbackURL: '/verify-email?status=ok',
          },
        });
      } catch (error) {
        // Phòng khi một phiên bản Better Auth trả 422 cho email trùng: vẫn trung tính.
        if (statusOf(error) === 422) return { status: 'check_email' };
        throw new AppError('INTERNAL', 'Không đăng ký được tài khoản.', { cause: error });
      }
      return { status: 'check_email' };
    },

    async signIn(input: {
      email: string;
      password: string;
      headers: Headers;
      ip?: string;
    }): Promise<SignInResult> {
      const email = checkEmail(input.email);
      if (!email.ok) return { status: 'invalid_credentials' };
      if (input.password.length === 0 || input.password.length > MAX_PASSWORD_LENGTH) {
        return { status: 'invalid_credentials' };
      }

      const gate = await loginGate({ email: email.value, ...(input.ip ? { ip: input.ip } : {}) });
      if (!gate.allowed) {
        return {
          status: 'rate_limited',
          ...(gate.retryAfterSeconds === undefined
            ? {}
            : { retryAfterSeconds: gate.retryAfterSeconds }),
        };
      }

      let response: Response;
      try {
        response = (await auth.api.signInEmail({
          body: { email: email.value, password: input.password },
          headers: input.headers,
          asResponse: true,
        })) as Response;
      } catch (error) {
        return mapSignInStatus(statusOf(error), error);
      }
      if (!response.ok) return mapSignInStatus(response.status, undefined);

      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        twoFactorRedirect?: boolean;
        user?: { locale?: unknown };
      } | null;
      if (body?.twoFactorRedirect) return { status: 'two_factor_required' };
      return {
        status: 'ok',
        cookies: cookiesFromResponse(response),
        locale: isLocale(body?.user?.locale) ? body.user.locale : 'vi',
      };
    },

    /** Gửi lại thư xác minh. Luôn trả cùng một kết quả dù email có tồn tại hay không. */
    async resendVerification(input: { email: string }): Promise<ResendResult> {
      const email = checkEmail(input.email);
      if (!email.ok) return { status: 'invalid', problem: email.problem };
      try {
        await auth.api.sendVerificationEmail({
          body: { email: email.value, callbackURL: '/verify-email?status=ok' },
        });
      } catch {
        // Email lạ, đã xác minh, hay lỗi tạm: giao diện không được phân biệt.
      }
      return { status: 'sent_if_exists' };
    },

    /** Quên mật khẩu: luôn trả cùng một kết quả (thư chỉ gửi nếu email có thật). */
    async requestPasswordReset(input: { email: string }): Promise<ForgotResult> {
      const email = checkEmail(input.email);
      if (!email.ok) return { status: 'invalid', problem: email.problem };
      try {
        await auth.api.requestPasswordReset({
          body: { email: email.value, redirectTo: '/reset-password' },
        });
      } catch {
        // Không phân biệt email lạ với lỗi tạm thời ở giao diện.
      }
      return { status: 'sent_if_exists' };
    },

    /** Đặt mật khẩu mới bằng token trong thư (dùng một lần, hết hạn sau 1 giờ); mọi phiên cũ bị thu hồi. */
    async resetPassword(input: { token: string; newPassword: string }): Promise<ResetResult> {
      const problem = checkPassword(input.newPassword);
      if (problem) return { status: 'invalid', problem };
      if (input.token.length === 0 || input.token.length > 512) return { status: 'invalid_token' };
      try {
        await auth.api.resetPassword({
          body: { newPassword: input.newPassword, token: input.token },
        });
      } catch (error) {
        const status = statusOf(error);
        if (status === 400 || status === 401 || status === 403 || status === 404) {
          return { status: 'invalid_token' };
        }
        throw new AppError('INTERNAL', 'Không đặt lại được mật khẩu.', { cause: error });
      }
      return { status: 'ok' };
    },

    /** Đăng xuất: xóa phiên phía server và trả các cookie cần xóa. */
    async signOut(headers: Headers): Promise<CookieSpec[]> {
      try {
        const response = (await auth.api.signOut({ headers, asResponse: true })) as Response;
        return cookiesFromResponse(response);
      } catch (error) {
        throw new AppError('INTERNAL', 'Không đăng xuất được.', { cause: error });
      }
    },
  };

  return {
    ...flows,
    register: padded(flows.register),
    resendVerification: padded(flows.resendVerification),
    requestPasswordReset: padded(flows.requestPasswordReset),
  };
}

function mapSignInStatus(status: number | undefined, cause: unknown): SignInResult {
  if (status === 401 || status === 400 || status === 404) return { status: 'invalid_credentials' };
  if (status === 403) return { status: 'email_not_verified' };
  if (status === 429) return { status: 'rate_limited' };
  throw new AppError('INTERNAL', 'Không đăng nhập được.', { cause });
}

export type AuthFlows = ReturnType<typeof createAuthFlows>;
