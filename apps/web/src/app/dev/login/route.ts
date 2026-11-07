import { APP_SESSION_SECONDS } from '@flow/saas-core';
import { cookies, headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { applyCookies } from '../../../lib/apply-cookies';
import { getAuthRuntime } from '../../../server/auth';
import {
  DEV_AUTO_LOGIN_FLAG,
  DEV_NAME_TAG,
  DEV_OWNER_EMAIL,
  DEV_WORKSPACE_NAME,
  decideDevAutoLogin,
  isProxiedRequest,
  signSessionCookieValue,
} from '../../../server/dev-auto-login';
import {
  WORKSPACE_COOKIE,
  WORKSPACE_COOKIE_TTL_SECONDS,
} from '../../../server/workspace-selection';

export const dynamic = 'force-dynamic';

const notFound = () => new Response(null, { status: 404 });

/**
 * `GET /dev/login[?next=/app/...]` — CHỈ DEV (xem `server/dev-auto-login.ts`, docs/plans/feat-dev-auto-login.md).
 * Tạo một phiên thật cho Owner mẫu `[MẪU] Demo Shop` rồi chuyển tới `/app/...`. Mọi khóa sai → 404 trống.
 * Không nhận email/mật khẩu. KHÔNG sửa cổng `requireAppUser`: phiên này đi qua đúng các kiểm tra như mọi phiên.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const requestHeaders = await headers();
  const decision = decideDevAutoLogin({
    nodeEnv: process.env.NODE_ENV,
    appEnv: process.env.APP_ENV,
    databaseUrl: process.env.DATABASE_URL,
    databaseAuthUrl: process.env.DATABASE_AUTH_URL,
    flag: process.env[DEV_AUTO_LOGIN_FLAG],
    host: requestHeaders.get('host'),
    forwarded: isProxiedRequest({
      forwarded: requestHeaders.get('forwarded'),
      xForwardedFor: requestHeaders.get('x-forwarded-for'),
    }),
    next: request.nextUrl.searchParams.get('next'),
  });
  if (!decision.allowed) return notFound();
  // Chống login-CSRF: chỉ nhận khi người dùng tự gõ/bấm (Sec-Fetch-Site none) hoặc cùng origin.
  const fetchSite = requestHeaders.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'none' && fetchSite !== 'same-origin') return notFound();

  const runtime = getAuthRuntime();
  const context = await runtime.auth.$context;
  const found = await context.internalAdapter.findUserByEmail(DEV_OWNER_EMAIL);
  const user = found?.user;
  // Chỉ vào đúng tài khoản có nhãn [MẪU] và đang là Owner của workspace mẫu; thiếu → chưa chạy `pnpm dev:seed-demo`.
  if (!user?.name.startsWith(DEV_NAME_TAG)) return notFound();
  const memberships = await runtime.tenancy.listWorkspacesOfUser(user.id);
  const workspace = memberships.find((m) => m.name === DEV_WORKSPACE_NAME && m.role === 'owner');
  if (!workspace) return notFound();

  const session = await context.internalAdapter.createSession(user.id, false);
  const jar = await cookies();
  const secure = runtime.secureCookies;
  applyCookies(jar, [
    {
      name: context.authCookies.sessionToken.name,
      value: signSessionCookieValue(session.token, context.secret),
      path: '/',
      maxAge: APP_SESSION_SECONDS,
      httpOnly: true,
      sameSite: 'lax',
      ...(secure ? { secure: true } : {}),
    },
  ]);
  jar.set({
    name: WORKSPACE_COOKIE,
    value: runtime.workspaceCookie.sign(workspace.id),
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WORKSPACE_COOKIE_TTL_SECONDS,
  });

  // Một dòng log, không PII (không email/tên/id).
  console.info(JSON.stringify({ event: 'dev_auto_login', target: 'demo-owner' }));
  return new NextResponse(null, { status: 303, headers: { Location: decision.next } });
}
