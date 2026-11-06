import { getTranslations } from 'next-intl/server';
import { MembersView } from '../../../../components/app/members-view';
import { getAuthRuntime } from '../../../../server/auth';
import { getBrand } from '../../../../server/brand';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('members');
  return { title: `${t('title')} · ${getBrand().name}` };
}

/** Trang Thành viên (chỉ Owner; Staff nhận 404 — docs/13 §3.1): danh sách, đổi vai trò, tạm khóa, gỡ, lời mời. */
export default async function MembersPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const admin = getAuthRuntime().workspaceAdmin;
  const input = { workspaceId: workspace.id, actorUserId: user.id };
  const [members, invitations] = await Promise.all([
    admin.listMembers(input),
    admin.listInvitations(input),
  ]);
  return (
    <MembersView
      currentUserId={user.id}
      workspaceName={workspace.name}
      members={members}
      invitations={invitations}
    />
  );
}
