import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuthRuntime } from '../../../../../server/auth';
import { buildFbOAuthClient, getEnabledFbConfig } from '../../../../../server/fb-connect-runtime';
import {
  encodeOAuthSession,
  FB_SESSION_COOKIE,
  FB_SESSION_COOKIE_PATH,
  FB_STATE_COOKIE,
  FB_STATE_TTL_SECONDS,
  isOAuthStateValid,
} from '../../../../../server/fb-oauth-state';
import { requireAppUser } from '../../../../../server/require-app-user';

export const dynamic = 'force-dynamic';

const BACK = '/app/channels';

/**
 * Meta chuyển người dùng về đây (`?code=…&state=…`, hoặc `?error=…` khi từ chối). Thứ tự an toàn:
 *  1. cờ tắt → 404; chỉ Owner đang đăng nhập (`requireAppUser`);
 *  2. cookie `state` bị XÓA ngay (dùng một lần); `state` sai/hết hạn/khác người dùng-workspace → quay lại, KHÔNG gọi Meta;
 *  3. đổi `code` → token dài hạn; token chỉ vào cookie NIÊM PHONG (mã hóa, 10 phút, đường dẫn hẹp), không DB, không log;
 *  4. chuyển sang bước chọn Page. Lỗi Meta chỉ ghi MÃ (không token/URL) rồi quay lại với thông báo chung.
 */
export async function GET(request: Request): Promise<never> {
  const config = getEnabledFbConfig();
  if (!config) notFound();
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const runtime = getAuthRuntime();
  const jar = await cookies();

  const stateCookie = jar.get(FB_STATE_COOKIE)?.value;
  jar.delete({ name: FB_STATE_COOKIE, path: '/api/channels/facebook' });

  const params = new URL(request.url).searchParams;
  const valid = isOAuthStateValid({
    queryState: params.get('state'),
    cookiePayload: runtime.fbOAuthState.verify(stateCookie),
    workspaceId: workspace.id,
    userId: user.id,
  });
  if (!valid) redirect(`${BACK}?fb=state`);
  if (params.get('error')) redirect(`${BACK}?fb=denied`); // người dùng bấm Hủy ở Meta
  const code = params.get('code');
  if (!code || code.length > 2048) redirect(`${BACK}?fb=error`);

  let sealed: string | null = null;
  try {
    const oauth = buildFbOAuthClient(config);
    const userToken = await oauth.extendUserToken(await oauth.exchangeCode(code));
    sealed = runtime.fbOAuthSession.seal(
      encodeOAuthSession({ userToken, workspaceId: workspace.id, userId: user.id }),
    );
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(
      JSON.stringify({ event: 'fb_oauth_callback_failed', code: e?.code ?? 'unknown' }),
    );
  }
  if (!sealed) redirect(`${BACK}?fb=error`);

  jar.set({
    name: FB_SESSION_COOKIE,
    value: sealed,
    httpOnly: true,
    secure: runtime.secureCookies,
    sameSite: 'lax',
    path: FB_SESSION_COOKIE_PATH,
    maxAge: FB_STATE_TTL_SECONDS,
  });
  redirect(`${BACK}?fb=select`);
}
