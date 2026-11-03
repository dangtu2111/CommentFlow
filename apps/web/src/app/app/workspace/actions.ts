'use server';

import { notFound, redirect } from 'next/navigation';
import { getAuthRuntime } from '../../../server/auth';
import { requireAppUser } from '../../../server/require-app-user';
import { rememberWorkspace } from '../../../server/workspace-cookie';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chuyển workspace. `workspaceId` từ form chỉ là GỢI Ý: phải nằm trong danh sách workspace mà người dùng là thành
 * viên `active` (đọc qua withUser) — nếu không thì 404, không lộ workspace đó có tồn tại hay không.
 */
export async function switchWorkspaceAction(data: FormData): Promise<void> {
  const { user } = await requireAppUser({ workspace: 'optional' });
  const requested = data.get('workspaceId');
  if (typeof requested !== 'string' || !UUID.test(requested)) notFound();
  const mine = await getAuthRuntime().tenancy.listWorkspacesOfUser(user.id);
  if (!mine.some((w) => w.id === requested)) notFound();
  await rememberWorkspace(requested);
  redirect('/app');
}
