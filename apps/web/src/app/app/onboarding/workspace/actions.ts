'use server';

import { isAppError } from '@flow/shared';
import { redirect } from 'next/navigation';
import { parseWorkspaceForm, type WorkspaceFormState } from '../../../../lib/workspace-form';
import { getAuthRuntime } from '../../../../server/auth';
import { requireAppUser } from '../../../../server/require-app-user';
import { rememberWorkspace } from '../../../../server/workspace-cookie';

/** Tạo workspace; người tạo là Owner (tenancy). userId lấy từ phiên phía server, KHÔNG từ form. */
export async function createWorkspaceAction(
  _previous: WorkspaceFormState,
  data: FormData,
): Promise<WorkspaceFormState> {
  const { user } = await requireAppUser({ workspace: 'optional' });
  const parsed = parseWorkspaceForm({
    name: data.get('name'),
    timezone: data.get('timezone'),
    defaultLang: data.get('defaultLang'),
  });
  if (!parsed.ok) return { status: 'error', message: parsed.message, values: parsed.values };

  let workspaceId: string;
  try {
    const created = await getAuthRuntime().tenancy.createWorkspace({
      userId: user.id,
      name: parsed.name,
      timezone: parsed.timezone,
      defaultLang: parsed.defaultLang,
    });
    workspaceId = created.id;
  } catch (error) {
    // Lỗi kiểm đầu vào của saas-core đã được form chặn trước; còn lại là lỗi hệ thống → thông báo chung.
    if (!isAppError(error)) console.error(JSON.stringify({ event: 'workspace_create_failed' }));
    return {
      status: 'error',
      message: 'generic',
      values: { name: parsed.name, timezone: parsed.timezone, defaultLang: parsed.defaultLang },
    };
  }
  await rememberWorkspace(workspaceId);
  // Owner chưa bật 2FA sẽ được cổng requireAppUser chuyển tới /app/security ở trang kế tiếp.
  redirect('/app');
}
