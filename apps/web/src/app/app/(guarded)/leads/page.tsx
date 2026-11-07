import { getTranslations } from 'next-intl/server';
import { LeadsView } from '../../../../components/leads/leads-view';
import { TwPage } from '../../../../components/ui/tw-parts';
import { showSampleData } from '../../../../lib/sample-data';
import { getBrand } from '../../../../server/brand';
import { loadLeadsBoard } from '../../../../server/leads';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('leads');
  return { title: `${t('title')} · ${getBrand().name}` };
}

/**
 * Khách tiềm năng (FR-082): bảng Kanban CHỈ ĐỌC dựng từ design/stitch/leads.html (Tailwind), mọi thành viên xem được
 * (RLS theo workspace). SĐT chỉ hiện 4 số cuối; kéo-thả/giải mã/xuất file/ngăn chi tiết là khung "Sắp có". Workspace +
 * người dùng lấy từ `requireAppUser`.
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
    <TwPage>
      {data ? (
        <LeadsView leads={data.leads} counts={data.counts} sample={showSampleData()} />
      ) : (
        <div
          role="alert"
          className="rounded-xl bg-error-container p-space-md font-body-md text-body-md text-on-error-container"
        >
          <strong>{t('error.title')}</strong> {t('error.body')}
        </div>
      )}
    </TwPage>
  );
}
