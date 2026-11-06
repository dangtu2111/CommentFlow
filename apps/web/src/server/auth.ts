import {
  type Auth,
  type AuthFlows,
  type AuthHandle,
  createAuth,
  createAuthFlows,
  createNotifier,
  createPasswordPolicy,
  createSealedValueCodec,
  createSignedValueCodec,
  createSmtpTransport,
  createTwoFactorFlows,
  createValkeyRateLimiter,
  openAuthDb,
  openWorkspaceServices,
  type RateLimiter,
  type SealedValueCodec,
  type SignedValueCodec,
  type Tenancy,
  type TwoFactorFlows,
  type WorkspaceAdmin,
} from '@flow/saas-core';
import type { ClientIpSource } from '../lib/client-ip';
import { INVITE_COOKIE_LABEL, INVITE_COOKIE_TTL_SECONDS } from '../lib/invite-token';
import { loadServerEnv } from './env';
import {
  FB_SESSION_COOKIE_LABEL,
  FB_STATE_COOKIE_LABEL,
  FB_STATE_TTL_SECONDS,
} from './fb-oauth-state';
import { WORKSPACE_COOKIE_LABEL, WORKSPACE_COOKIE_TTL_SECONDS } from './workspace-selection';

/**
 * Gốc lắp ráp của phần xác thực: đọc env, mở pool role cf_auth, dựng SMTP + notifier + Better Auth + luồng.
 * Tạo LAZY và một lần (qua globalThis để sống sót qua hot reload của `next dev`), nên `next build` không cần env.
 */
export type AuthRuntime = {
  auth: Auth;
  authHandle: AuthHandle;
  flows: AuthFlows;
  twoFactor: TwoFactorFlows;
  tenancy: Tenancy;
  /** Thành viên + lời mời (Owner); kiểm quyền Owner nằm trong saas-core. */
  workspaceAdmin: WorkspaceAdmin;
  /** Ký cookie lựa chọn workspace (khóa HKDF nhãn riêng, không dùng secret gốc). */
  workspaceCookie: SignedValueCodec;
  /** Ký cookie nhớ lời mời đang chờ qua bước đăng nhập/đăng ký/xác minh (khóa HKDF nhãn riêng). */
  inviteCookie: SignedValueCodec;
  /** Ký cookie `state` OAuth Facebook (10 phút). */
  fbOAuthState: SignedValueCodec;
  /** Niêm phong (mã hóa) cookie giữ token người dùng giữa callback OAuth và bước chọn Page (10 phút). */
  fbOAuthSession: SealedValueCodec;
  appUrl: string;
  /** Cờ `secure` của cookie do ta đặt: lấy từ URL công khai đã cấu hình (https), không từ NODE_ENV. */
  secureCookies: boolean;
  limiter: RateLimiter;
  clientIpSource: ClientIpSource;
};

const holder = globalThis as typeof globalThis & { __cfAuthRuntime?: AuthRuntime };

function createRuntime(): AuthRuntime {
  const env = loadServerEnv();
  const authHandle = openAuthDb({ connectionString: env.DATABASE_AUTH_URL });
  const notifier = createNotifier({
    brandName: env.brand.name,
    transport: createSmtpTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      from: env.mailFrom,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : {}),
    }),
    // Chỉ loại thư + lý do đã lọc; không có địa chỉ, URL hay token.
    onFailure: (failure) => console.warn(JSON.stringify({ event: 'mail_failed', ...failure })),
  });
  const { limiter } = createValkeyRateLimiter({
    url: env.REDIS_URL,
    keyPrefix: env.REDIS_KEY_PREFIX,
    secret: env.BETTER_AUTH_SECRET,
    // Chỉ loại sự kiện + hành động + chế độ; không có email, IP hay khóa.
    onWarn: (warning) => console.warn(JSON.stringify(warning)),
  });
  const passwordPolicy = createPasswordPolicy({
    pwnedEnabled: env.PWNED_CHECK === 'on',
    // Chỉ sự kiện + lý do; không có mật khẩu, băm hay tiền tố băm.
    onWarn: (warning) => console.warn(JSON.stringify(warning)),
  });
  const { tenancy, admin: workspaceAdmin } = openWorkspaceServices({
    connectionString: env.DATABASE_URL,
    notifier,
    limiter,
    appUrl: env.BETTER_AUTH_URL,
  });
  const auth = createAuth({
    authDb: authHandle,
    notifier,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    appEnv: env.APP_ENV,
    appName: env.brand.name,
  });
  const twoFactor = createTwoFactorFlows({
    auth,
    authDb: authHandle,
    limiter,
    secret: env.BETTER_AUTH_SECRET,
    workspaceRoles: async (userId) =>
      (await tenancy.listWorkspacesOfUser(userId)).map((w) => w.role),
  });
  return {
    auth,
    authHandle,
    flows: createAuthFlows({ auth, limiter, passwordPolicy, twoFactor }),
    twoFactor,
    tenancy,
    workspaceAdmin,
    workspaceCookie: createSignedValueCodec({
      secret: env.BETTER_AUTH_SECRET,
      label: WORKSPACE_COOKIE_LABEL,
      ttlSeconds: WORKSPACE_COOKIE_TTL_SECONDS,
    }),
    inviteCookie: createSignedValueCodec({
      secret: env.BETTER_AUTH_SECRET,
      label: INVITE_COOKIE_LABEL,
      ttlSeconds: INVITE_COOKIE_TTL_SECONDS,
    }),
    fbOAuthState: createSignedValueCodec({
      secret: env.BETTER_AUTH_SECRET,
      label: FB_STATE_COOKIE_LABEL,
      ttlSeconds: FB_STATE_TTL_SECONDS,
    }),
    fbOAuthSession: createSealedValueCodec({
      secret: env.BETTER_AUTH_SECRET,
      label: FB_SESSION_COOKIE_LABEL,
      ttlSeconds: FB_STATE_TTL_SECONDS,
    }),
    appUrl: env.BETTER_AUTH_URL,
    secureCookies: env.BETTER_AUTH_URL.startsWith('https:'),
    limiter,
    clientIpSource: env.CLIENT_IP_SOURCE,
  };
}

export function getAuthRuntime(): AuthRuntime {
  holder.__cfAuthRuntime ??= createRuntime();
  return holder.__cfAuthRuntime;
}
