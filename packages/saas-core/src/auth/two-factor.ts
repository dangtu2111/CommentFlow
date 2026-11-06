import { and, desc, eq } from '@flow/db/runtime';
import { sessions } from '@flow/db/schema/core';
import { AppError, isLocale, type Locale } from '@flow/shared';
import QRCode from 'qrcode';
import type { RateLimiter } from '../ratelimit';
import type { Auth } from './auth';
import { MAX_PASSWORD_LENGTH } from './auth';
import { type AuthHandle, unwrapAuthDb } from './auth-db';
import { type CookieSpec, cookiesFromResponse } from './cookies';
import { bindingOf, signPending, verifyPending } from './pending';
import { revokeOtherSessionsOfUser } from './revoke';
import { type BrowserKind, type OsKind, parseUserAgent } from './ua';

/**
 * Xác thực 2 bước (TOTP + mã dự phòng) và quản lý phiên của chính người dùng — ADR 004 §4.
 * Giao diện chỉ thấy các kết quả dưới đây, không thấy mã lỗi thô của Better Auth.
 */

/** Cookie ký của ta: cho biết "ai vừa qua bước mật khẩu" để đếm giới hạn nhập mã đúng người. */
export const TWO_FACTOR_PENDING_COOKIE = 'cf-2fa-pending';
const PENDING_SECONDS = 600;

/** Owner của workspace hoặc quản trị nền tảng bắt buộc bật 2FA (docs/13 §2). */
export function requiresTwoFactor(input: { isAdmin: boolean; workspaceRoles: string[] }): boolean {
  return input.isAdmin || input.workspaceRoles.includes('owner');
}

export type VerifyTwoFactorResult =
  | { status: 'ok'; cookies: CookieSpec[]; locale: Locale }
  | { status: 'invalid_code' }
  /** Cookie chờ hết hạn/không có/giả: quay lại bước đăng nhập. */
  | { status: 'expired' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

export type ReauthResult<T = Record<never, never>> =
  | ({ status: 'ok' } & T)
  | { status: 'wrong_password' }
  | { status: 'invalid_code' }
  | { status: 'already_enabled' }
  /** Owner/Admin bắt buộc có 2FA nên không được tắt. */
  | { status: 'required' }
  | { status: 'unauthenticated' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

export type SessionItem = {
  id: string;
  browser: BrowserKind;
  os: OsKind;
  lastUsedAt: Date;
  createdAt: Date;
  current: boolean;
};

export type AppPrincipal = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  twoFactorEnabled: boolean;
  /** Owner của một workspace hoặc quản trị nền tảng → bắt buộc bật 2FA. */
  twoFactorRequired: boolean;
};

export type SecurityOverview = {
  twoFactorEnabled: boolean;
  /** Tài khoản thuộc diện bắt buộc 2FA (Owner của workspace hoặc quản trị nền tảng). */
  required: boolean;
  sessions: SessionItem[];
};

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

/** Giá trị cookie `two_factor` của plugin (tên có thể có tiền tố `__Secure-`), đúng dạng mã hóa URL như ở Set-Cookie. */
function pluginCookieValue(headers: Headers): string | undefined {
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key?.endsWith('two_factor')) return rest.join('=');
  }
  return undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cookie `name=value` của header Cookie (không giải mã thêm). */
function readCookie(headers: Headers, name: string): string | undefined {
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

/**
 * Mã do người dùng gõ. TOTP: bỏ khoảng trắng/gạch ngang ("123 456"). Mã dự phòng có dạng "xxxxx-xxxxx" nên GIỮ gạch
 * ngang, chỉ bỏ khoảng trắng hai đầu. Cắt độ dài trước khi chạm vào plugin.
 */
const normalizeCode = (value: string, kind: 'totp' | 'backup' = 'totp'): string =>
  (kind === 'totp' ? value.replace(/[\s-]/g, '') : value.trim()).slice(0, 32);

export function createTwoFactorFlows(options: {
  auth: Auth;
  authDb: AuthHandle;
  limiter: RateLimiter;
  /** Khóa ký cookie chờ (dùng BETTER_AUTH_SECRET). */
  secret: string;
  /** Vai trò của người dùng trong các workspace (từ tenancy, qua RLS) — để biết có thuộc diện bắt buộc 2FA không. */
  workspaceRoles: (userId: string) => Promise<string[]>;
  /** Dùng để so thời gian hết hạn của cookie chờ (test). */
  now?: () => number;
}) {
  const { auth, authDb, limiter, secret, workspaceRoles } = options;
  const now = options.now ?? Date.now;

  /** Người dùng của phiên hiện tại (đọc phía server); null nếu chưa đăng nhập. */
  async function currentUser(headers: Headers) {
    const current = await auth.api.getSession({ headers });
    if (!current) return null;
    const user = current.user as {
      id: string;
      name?: string;
      email?: string;
      emailVerified?: boolean;
      twoFactorEnabled?: boolean;
      isAdmin?: boolean;
    };
    return {
      id: user.id,
      name: user.name ?? '',
      email: user.email ?? '',
      emailVerified: user.emailVerified === true,
      twoFactorEnabled: user.twoFactorEnabled === true,
      isAdmin: user.isAdmin === true,
      session: current.session,
    };
  }

  const isRequiredFor = async (user: { id: string; isAdmin: boolean }): Promise<boolean> =>
    requiresTwoFactor({ isAdmin: user.isAdmin, workspaceRoles: await workspaceRoles(user.id) });

  /** Đếm lần thử xác nhận lại theo userId; cho phép chạy `run`; thành công thì xóa bộ đếm. */
  async function guarded<T>(
    userId: string,
    run: () => Promise<ReauthResult<T>>,
  ): Promise<ReauthResult<T>> {
    const gate = await limiter.check('reauth', { userId });
    if (!gate.allowed) return { status: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds };
    const result = await run();
    if (result.status === 'ok') await limiter.reset('reauth', { userId });
    return result;
  }

  const wrongPassword = (error: unknown): boolean => {
    const status = statusOf(error);
    return status === 400 || status === 401 || status === 403;
  };

  /**
   * Cookie chờ hợp lệ VÀ gắn đúng với cookie `two_factor` của plugin trong cùng request. Nhờ đó không ghép được cookie
   * plugin của nạn nhân với cookie chờ của tài khoản khác để lấy thêm lượt thử (rate limit đếm theo email trong cookie ký).
   */
  const pendingOf = (headers: Headers): { email: string } | null => {
    const pending = verifyPending(secret, readCookie(headers, TWO_FACTOR_PENDING_COOKIE), now);
    if (!pending) return null;
    const pluginValue = pluginCookieValue(headers);
    return pluginValue !== undefined && bindingOf(pluginValue) === pending.binding
      ? { email: pending.email }
      : null;
  };

  const tooLong = (password: string): boolean => password.length > MAX_PASSWORD_LENGTH;

  const pendingCookieFor = (email: string, template: CookieSpec | undefined): CookieSpec => ({
    ...(template ?? {}),
    name: TWO_FACTOR_PENDING_COOKIE,
    value: signPending(secret, email, bindingOf(template?.value ?? ''), {
      ttlSeconds: PENDING_SECONDS,
      now,
    }),
    path: '/',
    maxAge: PENDING_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
  });
  const clearPendingCookie = (): CookieSpec => ({
    name: TWO_FACTOR_PENDING_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
  });

  return {
    /** Tạo cookie chờ (gọi ngay sau khi bước mật khẩu cho `twoFactorRedirect`). Giữ thuộc tính của cookie plugin. */
    pendingCookieFor,
    clearPendingCookie,

    /** Còn cookie chờ hợp lệ không (để trang /login/2fa chuyển về /login nếu hết hạn). */
    hasPending(headers: Headers): boolean {
      return pendingOf(headers) !== null;
    },

    /** Nhập mã lúc đăng nhập (TOTP hoặc mã dự phòng). Mật khẩu đúng nhưng chưa nhập mã → chưa có phiên. */
    async verifyLogin(input: {
      code: string;
      kind: 'totp' | 'backup';
      headers: Headers;
    }): Promise<VerifyTwoFactorResult> {
      const pending = pendingOf(input.headers);
      if (!pending) return { status: 'expired' };
      const { email } = pending;
      const gate = await limiter.check('twofa', { email });
      if (!gate.allowed)
        return { status: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds };

      const code = normalizeCode(input.code, input.kind);
      if (code.length === 0) return { status: 'invalid_code' };
      let response: Response;
      try {
        const request = { body: { code }, headers: input.headers, asResponse: true as const };
        response = (await (input.kind === 'totp'
          ? auth.api.verifyTOTP(request)
          : auth.api.verifyBackupCode(request))) as Response;
      } catch (error) {
        return mapVerifyFailure(statusOf(error), codeOf(error));
      }
      if (!response.ok) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as { code?: string } | null;
        return mapVerifyFailure(response.status, body?.code);
      }
      await limiter.reset('twofa', { email });
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        user?: { locale?: unknown };
      } | null;
      return {
        status: 'ok',
        cookies: [...cookiesFromResponse(response), clearPendingCookie()],
        locale: isLocale(body?.user?.locale) ? body.user.locale : 'vi',
      };
    },

    /**
     * Người dùng đã xác thực của phiên hiện tại, MỌI trạng thái lấy phía server (không từ client): dùng cho
     * `requireAppUser()` của web. null nếu chưa đăng nhập.
     */
    async principal(headers: Headers): Promise<AppPrincipal | null> {
      const user = await currentUser(headers);
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorRequired: await isRequiredFor(user),
      };
    },

    /** Tình trạng 2FA của phiên hiện tại (nhẹ: không liệt kê phiên) — dùng cho cổng bắt buộc 2FA ở layout. */
    async posture(
      headers: Headers,
    ): Promise<{ twoFactorEnabled: boolean; required: boolean } | null> {
      const user = await currentUser(headers);
      if (!user) return null;
      return { twoFactorEnabled: user.twoFactorEnabled, required: await isRequiredFor(user) };
    },

    /** Dữ liệu trang bảo mật: trạng thái 2FA và các phiên CỦA CHÍNH người dùng (không IP, không token). */
    async overview(headers: Headers): Promise<SecurityOverview | null> {
      const user = await currentUser(headers);
      if (!user) return null;
      const rows = await unwrapAuthDb(authDb).transaction((tx) =>
        tx
          .select({
            id: sessions.id,
            userAgent: sessions.userAgent,
            createdAt: sessions.createdAt,
            updatedAt: sessions.updatedAt,
            expiresAt: sessions.expiresAt,
          })
          .from(sessions)
          .where(eq(sessions.userId, user.id))
          .orderBy(desc(sessions.updatedAt)),
      );
      const currentId = (user.session as { id: string }).id;
      return {
        twoFactorEnabled: user.twoFactorEnabled,
        required: await isRequiredFor(user),
        sessions: rows
          .filter((row) => row.expiresAt.getTime() > now())
          .map((row) => ({
            id: row.id,
            ...parseUserAgent(row.userAgent),
            lastUsedAt: row.updatedAt,
            createdAt: row.createdAt,
            current: row.id === currentId,
          })),
      };
    },

    /** Đăng xuất MỘT phiên của chính mình (không phải phiên hiện tại — dùng đăng xuất thường). Không đụng phiên người khác. */
    async revokeSession(input: { sessionId: string; headers: Headers }): Promise<boolean> {
      if (!UUID_PATTERN.test(input.sessionId)) return false;
      const user = await currentUser(input.headers);
      if (!user) return false;
      if ((user.session as { id: string }).id === input.sessionId) return false;
      const removed = await unwrapAuthDb(authDb).transaction((tx) =>
        tx
          .delete(sessions)
          .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, user.id)))
          .returning({ id: sessions.id }),
      );
      return removed.length > 0;
    },

    /** "Đăng xuất tất cả thiết bị khác": xóa mọi phiên của chính mình trừ phiên hiện tại. Trả số phiên đã xóa, null nếu chưa đăng nhập. */
    async revokeOtherSessions(headers: Headers): Promise<number | null> {
      const user = await currentUser(headers);
      if (!user) return null;
      return revokeOtherSessionsOfUser(authDb, user.id, (user.session as { id: string }).id);
    },

    /** Bước 1 bật 2FA: cần mật khẩu. Trả QR (server tạo), khóa nhập tay và 10 mã dự phòng — hiện cho người dùng một lần. */
    async beginEnrollment(input: {
      password: string;
      headers: Headers;
    }): Promise<ReauthResult<{ qrDataUrl: string; manualKey: string; backupCodes: string[] }>> {
      const user = await currentUser(input.headers);
      if (!user) return { status: 'unauthenticated' };
      if (tooLong(input.password)) return { status: 'wrong_password' };
      if (user.twoFactorEnabled) return { status: 'already_enabled' };
      return guarded(user.id, async () => {
        try {
          const result = (await auth.api.enableTwoFactor({
            body: { password: input.password },
            headers: input.headers,
          })) as { totpURI: string; backupCodes: string[] };
          const manualKey = new URL(result.totpURI).searchParams.get('secret') ?? '';
          const qrDataUrl = await QRCode.toDataURL(result.totpURI, { margin: 1, width: 224 });
          return { status: 'ok', qrDataUrl, manualKey, backupCodes: result.backupCodes };
        } catch (error) {
          if (wrongPassword(error)) return { status: 'wrong_password' };
          throw new AppError('INTERNAL', 'Không bắt đầu được bật 2FA.', { cause: error });
        }
      });
    },

    /** Bước 2 bật 2FA: nhập mã đầu tiên từ ứng dụng xác thực → 2FA mới thật sự bật. */
    async confirmEnrollment(input: {
      code: string;
      headers: Headers;
    }): Promise<ReauthResult<{ cookies: CookieSpec[] }>> {
      const user = await currentUser(input.headers);
      if (!user) return { status: 'unauthenticated' };
      return guarded(user.id, async (): Promise<ReauthResult<{ cookies: CookieSpec[] }>> => {
        try {
          // Plugin XOAY phiên khi bật 2FA (xóa phiên cũ, cấp phiên mới): phải trả cookie mới cho nơi gọi đặt lại.
          const response = (await auth.api.verifyTOTP({
            body: { code: normalizeCode(input.code) },
            headers: input.headers,
            asResponse: true,
          })) as Response;
          if (!response.ok) return { status: 'invalid_code' };
          return { status: 'ok', cookies: cookiesFromResponse(response) };
        } catch (error) {
          if (statusOf(error) === 401 || statusOf(error) === 400) return { status: 'invalid_code' };
          throw new AppError('INTERNAL', 'Không xác nhận được mã 2FA.', { cause: error });
        }
      });
    },

    /** Tắt 2FA (cần mật khẩu). Việc có được phép tắt hay không (Owner/Admin bắt buộc) do nơi gọi quyết định bằng `requiresTwoFactor`. */
    async disable(input: {
      password: string;
      headers: Headers;
    }): Promise<ReauthResult<{ cookies: CookieSpec[] }>> {
      const user = await currentUser(input.headers);
      if (!user) return { status: 'unauthenticated' };
      if (tooLong(input.password)) return { status: 'wrong_password' };
      if (await isRequiredFor(user)) return { status: 'required' };
      return guarded(user.id, async (): Promise<ReauthResult<{ cookies: CookieSpec[] }>> => {
        try {
          const response = (await auth.api.disableTwoFactor({
            body: { password: input.password },
            headers: input.headers,
            asResponse: true,
          })) as Response;
          if (!response.ok)
            return {
              status: wrongPassword({ status: response.status })
                ? 'wrong_password'
                : 'invalid_code',
            };
          return { status: 'ok', cookies: cookiesFromResponse(response) };
        } catch (error) {
          if (wrongPassword(error)) return { status: 'wrong_password' };
          throw new AppError('INTERNAL', 'Không tắt được 2FA.', { cause: error });
        }
      });
    },

    /** Tạo lại 10 mã dự phòng (cần mật khẩu); mã cũ mất hiệu lực. */
    async regenerateBackupCodes(input: {
      password: string;
      headers: Headers;
    }): Promise<ReauthResult<{ backupCodes: string[] }>> {
      const user = await currentUser(input.headers);
      if (!user) return { status: 'unauthenticated' };
      if (tooLong(input.password)) return { status: 'wrong_password' };
      return guarded(user.id, async () => {
        try {
          const result = (await auth.api.generateBackupCodes({
            body: { password: input.password },
            headers: input.headers,
          })) as { backupCodes: string[] };
          return { status: 'ok', backupCodes: result.backupCodes };
        } catch (error) {
          if (wrongPassword(error)) return { status: 'wrong_password' };
          throw new AppError('INTERNAL', 'Không tạo lại được mã dự phòng.', { cause: error });
        }
      });
    },
  };
}

function mapVerifyFailure(
  status: number | undefined,
  code: string | undefined,
): VerifyTwoFactorResult {
  if (code === 'INVALID_CODE' || code === 'INVALID_BACKUP_CODE') return { status: 'invalid_code' };
  if (status === 429 || code === 'ACCOUNT_TEMPORARILY_LOCKED') {
    return { status: 'rate_limited', retryAfterSeconds: 60 }; // khóa tạm riêng của plugin
  }
  if (status === 401 || status === 400) return { status: 'expired' };
  throw new AppError('INTERNAL', 'Không xác nhận được mã 2FA.');
}

export type TwoFactorFlows = ReturnType<typeof createTwoFactorFlows>;
