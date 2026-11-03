import { cookies } from 'next/headers';
import { getAuthRuntime } from './auth';
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_TTL_SECONDS } from './workspace-selection';

/**
 * Ghi lựa chọn workspace (chỉ gọi từ Server Action sau `requireAppUser` VÀ sau khi đã kiểm người dùng là thành viên
 * của workspace này). Cookie chỉ là gợi ý có chữ ký: mỗi request vẫn tra lại membership.
 */
export async function rememberWorkspace(workspaceId: string): Promise<void> {
  (await cookies()).set({
    name: WORKSPACE_COOKIE,
    value: getAuthRuntime().workspaceCookie.sign(workspaceId),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: WORKSPACE_COOKIE_TTL_SECONDS,
  });
}
