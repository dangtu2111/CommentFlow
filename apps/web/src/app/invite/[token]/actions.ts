'use server';

import { redirect } from 'next/navigation';
import { TOKEN_PATTERN } from '../../../lib/invite-token';
import { retryMinutes } from '../../../lib/members-form';
import { getAuthRuntime } from '../../../server/auth';
import { forgetInvite, rememberInvite } from '../../../server/invite-cookie';
import { requestContext } from '../../../server/request-context';
import { rememberWorkspace } from '../../../server/workspace-cookie';

export type AcceptInviteState =
  | { status: 'idle' }
  | { status: 'error'; message: 'invalid' | 'rateLimited' | 'generic'; retryMinutes?: number };

/**
 * Nhận lời mời bằng token. Người dùng lấy từ PHIÊN phía server (không từ form); email được so khớp trong DB
 * (hàm `core.accept_invitation` không nhận email). MỌI ca không hợp lệ cho cùng một thông báo trung tính.
 * Chưa đăng nhập → nhớ token (cookie ký) rồi chuyển tới /login.
 */
export async function acceptInviteAction(
  _previous: AcceptInviteState,
  data: FormData,
): Promise<AcceptInviteState> {
  const raw = data.get('token');
  const token = typeof raw === 'string' && TOKEN_PATTERN.test(raw) ? raw : null;
  if (!token) return { status: 'error', message: 'invalid' };

  const runtime = getAuthRuntime();
  const principal = await runtime.twoFactor.principal((await requestContext()).headers);
  if (!principal) {
    await rememberInvite(token);
    redirect('/login');
  }

  let workspaceId: string;
  try {
    const result = await runtime.workspaceAdmin.acceptInvitation({ userId: principal.id, token });
    if (result.status === 'rate_limited') {
      return {
        status: 'error',
        message: 'rateLimited',
        retryMinutes: retryMinutes(result.retryAfterSeconds),
      };
    }
    if (result.status === 'invalid') return { status: 'error', message: 'invalid' };
    workspaceId = result.workspaceId;
  } catch {
    console.error(JSON.stringify({ event: 'invite_accept_failed' }));
    return { status: 'error', message: 'generic' };
  }
  await rememberWorkspace(workspaceId);
  await forgetInvite();
  redirect('/app');
}
