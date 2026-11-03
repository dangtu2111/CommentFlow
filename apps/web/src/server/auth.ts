import {
  type Auth,
  type AuthFlows,
  type AuthHandle,
  createAuth,
  createAuthFlows,
  createNotifier,
  createSmtpTransport,
  openAuthDb,
} from '@flow/saas-core';
import { loadServerEnv } from './env';

/**
 * Gốc lắp ráp của phần xác thực: đọc env, mở pool role cf_auth, dựng SMTP + notifier + Better Auth + luồng.
 * Tạo LAZY và một lần (qua globalThis để sống sót qua hot reload của `next dev`), nên `next build` không cần env.
 */
export type AuthRuntime = {
  auth: Auth;
  authHandle: AuthHandle;
  flows: AuthFlows;
  appUrl: string;
  trustedProxyHops: number;
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
  const auth = createAuth({
    authDb: authHandle,
    notifier,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    appEnv: env.APP_ENV,
  });
  return {
    auth,
    authHandle,
    flows: createAuthFlows({ auth }),
    appUrl: env.BETTER_AUTH_URL,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  };
}

export function getAuthRuntime(): AuthRuntime {
  holder.__cfAuthRuntime ??= createRuntime();
  return holder.__cfAuthRuntime;
}
