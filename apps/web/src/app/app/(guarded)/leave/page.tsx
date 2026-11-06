import { getTranslations } from 'next-intl/server';
import { LeaveWorkspace } from '../../../../components/app/leave-workspace';
import { getAuthRuntime } from '../../../../server/auth';
import { getBrand } from '../../../../server/brand';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('leave');
  return { title: `${t('title')} · ${getBrand().name}` };
}

/** Trang Rời workspace (mọi vai trò; lối vào ở bộ chuyển workspace). Owner cuối: giải thích + link Thành viên, không có nút. */
export default async function LeavePage() {
  const { user, workspace } = await requireAppUser({});
  const t = await getTranslations('leave');
  // Chỉ Owner mới đọc được danh sách thành viên (RLS); Staff không bao giờ là "Owner cuối".
  const lastOwner =
    workspace.role === 'owner' &&
    (
      await getAuthRuntime().workspaceAdmin.listMembers({
        workspaceId: workspace.id,
        actorUserId: user.id,
      })
    ).filter((m) => m.role === 'owner' && m.status === 'active').length <= 1;
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle', { workspace: workspace.name })}</p>
      <section className="card stack">
        <LeaveWorkspace lastOwner={lastOwner} />
      </section>
    </main>
  );
}
