import { getTranslations } from 'next-intl/server';
import { ReportBody, ReportHead } from '../../../../components/reports/report-body';
import { Banner } from '../../../../components/ui/banner';
import { parseReportRange } from '../../../../lib/report-view';
import { loadReport } from '../../../../server/reports';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('reports'), getTranslations('shell')]);
  return { title: `${t('title')} · ${tb('brand')}` };
}

/**
 * Báo cáo (FR-083): chỉ đọc. Owner thấy cả workspace, Staff chỉ số cá nhân (do `buildReport` thu hẹp phạm vi trước
 * khi tính). Khoảng ngày là tham số URL đã kiểm (7/30). Số liệu chưa có nguồn (xu hướng ngày, ý định, top bài viết)
 * không dựng (Q-UIHLR1).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await requireAppUser({});
  const [t, params] = await Promise.all([getTranslations('reports'), searchParams]);
  const days = parseReportRange(params.range);

  let data: Awaited<ReturnType<typeof loadReport>> | null = null;
  try {
    data = await loadReport(workspace.id, user.id, workspace.role, days);
  } catch (error) {
    console.error('reports.load_failed', { workspaceId: workspace.id, error });
  }
  return (
    <main className="app-page app-page-wide stack">
      <ReportHead days={days} isOwner={workspace.role === 'owner'} />
      {data ? (
        <ReportBody report={data.report} truncated={data.truncated} />
      ) : (
        <Banner variant="danger">
          <strong>{t('error.title')}</strong> {t('error.body')}
        </Banner>
      )}
    </main>
  );
}
