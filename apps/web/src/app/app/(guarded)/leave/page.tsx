import { getTranslations } from 'next-intl/server';
import { LeaveWorkspace } from '../../../../components/app/leave-workspace';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('leave');
  return { title: `${t('title')} · ${(await getTranslations('auth'))('brand')}` };
}

/** Trang Rời workspace (mọi vai trò; Staff không vào được trang Thành viên nên cần chỗ riêng). */
export default async function LeavePage() {
  const { workspace } = await requireAppUser({});
  const t = await getTranslations('leave');
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle', { workspace: workspace.name })}</p>
      <section className="card stack">
        <LeaveWorkspace lastOwner={false} />
      </section>
    </main>
  );
}
