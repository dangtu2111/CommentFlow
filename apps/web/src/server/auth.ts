import {
  type Auth,
  type AuthFlows,
  type AuthHandle,
  createAuth,
  createAuthFlows,
  createNotifier,
  createPasswordPolicy,
  createSignedValueCodec,
  createSmtpTransport,
  createTwoFactorFlows,
  createValkeyRateLimiter,
  openAuthDb,
  openTenancy,
  type SignedValueCodec,
  type Tenancy,
  type TwoFactorFlows,
} from '@flow/saas-core';
import type { ClientIpSource } from '../lib/client-ip';
import { loadServerEnv } from './env';
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
  /** Ký cookie lựa chọn workspace (khóa HKDF nhãn riêng, không dùng secret gốc). */
  workspaceCookie: SignedValueCodec;
  appUrl: string;
  clientIpSource: ClientIpSource;
};

const holder = globalThis as typeof globalThis & { __cfAuthRuntime?: AuthRuntime };

function createRuntime(): AuthRuntime {
  const env = loadServerEnv();
  const authHandle = openAuthDb({ connectionString: env.DATABASE_AUTH_URL });
  const notifier = createNotifier({
    transport: createSmtpTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      from: env.SMTP_FROM,
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
  const tenancy = openTenancy({ connectionString: env.DATABASE_URL });
  const auth = createAuth({
    authDb: authHandle,
    notifier,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    appEnv: env.APP_ENV,
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
    workspaceCookie: createSignedValueCodec({
      secret: env.BETTER_AUTH_SECRET,
      label: WORKSPACE_COOKIE_LABEL,
      ttlSeconds: WORKSPACE_COOKIE_TTL_SECONDS,
    }),
    appUrl: env.BETTER_AUTH_URL,
    clientIpSource: env.CLIENT_IP_SOURCE,
  };
}

export function getAuthRuntime(): AuthRuntime {
  holder.__cfAuthRuntime ??= createRuntime();
  return holder.__cfAuthRuntime;
}
