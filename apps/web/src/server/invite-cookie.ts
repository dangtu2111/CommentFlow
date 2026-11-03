import { cookies } from 'next/headers';
import { INVITE_COOKIE, INVITE_COOKIE_TTL_SECONDS, TOKEN_PATTERN } from '../lib/invite-token';
import { getAuthRuntime } from './auth';

/**
 * Cookie ký ghi nhớ MỘT lời mời đang chờ trong lúc người nhận đăng nhập/đăng ký/xác minh email rồi mới quay lại
 * nhận. Chứa chính token mời (đã ký + httpOnly); không phải nguồn quyền: nhận lời mời vẫn kiểm đủ điều kiện trong DB.
 */
export async function rememberInvite(token: string): Promise<void> {
  if (!TOKEN_PATTERN.test(token)) return;
  (await cookies()).set({
    name: INVITE_COOKIE,
    value: getAuthRuntime().inviteCookie.sign(token),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: INVITE_COOKIE_TTL_SECONDS,
  });
}

/** Token của lời mời đang chờ (chữ ký đúng, chưa hết hạn, đúng định dạng) hoặc null. */
export async function pendingInviteToken(): Promise<string | null> {
  const value = getAuthRuntime().inviteCookie.verify((await cookies()).get(INVITE_COOKIE)?.value);
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

export async function forgetInvite(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}
