import { getTranslations } from 'next-intl/server';
import { LeadsView } from '../../../../components/leads/leads-view';
import { Banner } from '../../../../components/ui/banner';
import { PageHeader } from '../../../../components/ui/page-header';
import { loadLeadsBoard } from '../../../../server/leads';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('leads'), getTranslations('shell')]);
  return { title: `${t('title')} · ${tb('brand')}` };
}

/**
 * Khách tiềm năng (FR-082): bảng Kanban CHỈ ĐỌC, mọi thành viên xem được (RLS theo workspace). SĐT chỉ hiện 4 số
 * cuối; chưa có kéo-thả/giải mã/xuất file (Q-UIHLR1). Workspace + người dùng lấy từ `requireAppUser`.
 */
export default async function LeadsPage() {
  const { user, workspace } = await requireAppUser({});
  const t = await getTranslations('leads');

  let data: Awaited<ReturnType<typeof loadLeadsBoard>> | null = null;
  try {
    data = await loadLeadsBoard(workspace.id, user.id);
  } catch (error) {
    console.error('leads.load_failed', { workspaceId: workspace.id, error });
  }
  return (
    <main className="app-page app-page-wide stack">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {data ? (
        <LeadsView leads={data.leads} counts={data.counts} />
      ) : (
        <Banner variant="danger">
          <strong>{t('error.title')}</strong> {t('error.body')}
        </Banner>
      )}
    </main>
  );
}
