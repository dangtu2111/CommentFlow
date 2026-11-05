'use server';

import { isAppError } from '@flow/shared';
import { redirect } from 'next/navigation';
import type { MembersFormState } from '../../../../lib/members-form';
import { getAuthRuntime } from '../../../../server/auth';
import { requireAppUser } from '../../../../server/require-app-user';

/**
 * Tự rời workspace đang chọn (mọi vai trò). KHÔNG nhận id từ form: workspaceId lấy từ workspace đã kiểm membership,
 * userId từ phiên. Owner cuối cùng bị chặn (CONFLICT → thông báo). Thành công (hoặc đã rời từ tab khác): chuyển về
 * `/app` — nơi `requireAppUser` chọn workspace khác còn là thành viên, hoặc đưa tới trang tạo workspace.
 */
export async function leaveWorkspaceAction(): Promise<MembersFormState> {
  const { user, workspace } = await requireAppUser({});
  try {
    await getAuthRuntime().workspaceAdmin.leaveWorkspace({
      workspaceId: workspace.id,
      userId: user.id,
    });
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === 'CONFLICT') return { status: 'error', message: 'leaveLastOwner' };
      if (error.code !== 'NOT_FOUND') {
        console.error(JSON.stringify({ event: 'leave_workspace_failed', code: error.code }));
        return { status: 'error', message: 'generic' };
      }
      // NOT_FOUND: đã rời rồi (bấm hai lần/tab khác) → coi như thành công.
    } else {
      console.error(JSON.stringify({ event: 'leave_workspace_failed' }));
      return { status: 'error', message: 'generic' };
    }
  }
  redirect('/app');
}
