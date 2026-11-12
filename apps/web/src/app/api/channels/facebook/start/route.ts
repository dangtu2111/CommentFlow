import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuthRuntime } from '../../../../../server/auth';
import { buildFbOAuthClient, getEnabledFbConfig } from '../../../../../server/fb-connect-runtime';
import {
  encodeOAuthState,
  FB_STATE_COOKIE,
  FB_STATE_TTL_SECONDS,
  newOAuthState,
} from '../../../../../server/fb-oauth-state';
import { requireAppUser } from '../../../../../server/require-app-user';

export const dynamic = 'force-dynamic';

/**
 * Bắt đầu kết nối Facebook (FR-010): CHỈ Owner (Staff → 404), cờ `FB_OAUTH_ENABLED` tắt → 404. Đặt cookie `state`
 * ký (10 phút, gắn người dùng + workspace) rồi chuyển sang hộp thoại đăng nhập của Meta. Dùng GET vì là điều hướng;
 * không có tác dụng phụ ngoài cookie `state` (không ghi DB).
 */
export async function GET(request: Request): Promise<never> {
  const config = getEnabledFbConfig();
  if (!config) notFound();
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const runtime = getAuthRuntime();

  const state = newOAuthState({ workspaceId: workspace.id, userId: user.id });
  (await cookies()).set({
    name: FB_STATE_COOKIE,
    value: runtime.fbOAuthState.sign(encodeOAuthState(state)),
    httpOnly: true,
    secure: runtime.secureCookies,
    sameSite: 'lax', // cần gửi kèm khi Meta chuyển hướng về (điều hướng cấp cao nhất)
    path: '/api/channels/facebook',
    maxAge: FB_STATE_TTL_SECONDS,
  });
  // `?rerequest=1`: xin lại quyền người dùng đã bỏ chọn/từ chối (Meta chỉ hỏi lại khi có `auth_type=rerequest`).
  const rerequest = new URL(request.url).searchParams.get('rerequest') === '1';
  redirect(
    buildFbOAuthClient(config).buildAuthorizeUrl(
      state.nonce,
      rerequest ? { rerequest: true } : undefined,
    ),
  );
}
