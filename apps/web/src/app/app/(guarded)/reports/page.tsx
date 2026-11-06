import { getTranslations } from 'next-intl/server';
import { ReportBody, ReportHead } from '../../../../components/reports/report-body';
import { TwPage } from '../../../../components/ui/tw-parts';
import { parseReportRange } from '../../../../lib/report-view';
import { showSampleData } from '../../../../lib/sample-data';
import { loadReport } from '../../../../server/reports';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('reports'), getTranslations('shell')]);
  return { title: `${t('title')} · ${tb('brand')}` };
}

/**
 * Báo cáo (FR-083): chỉ đọc, dựng từ design/stitch/reports.html bằng Tailwind. Owner thấy cả workspace, Staff chỉ số
 * cá nhân (do `buildReport` thu hẹp phạm vi trước khi tính). Khoảng ngày là tham số URL đã kiểm (7/30). Khối chưa có
 * nguồn (xu hướng ngày, ý định, top bài viết, gợi ý AI) hiện `[MẪU]` ở dev, "—"/"Sắp có" ở môi trường khác.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await requireAppUser({});
  const [t, params] = await Promise.all([getTranslations('reports'), searchParams]);
  const days = parseReportRange(params.range);
  const sample = showSampleData();

  let data: Awaited<ReturnType<typeof loadReport>> | null = null;
  try {
    data = await loadReport(workspace.id, user.id, workspace.role, days);
  } catch (error) {
    console.error('reports.load_failed', { workspaceId: workspace.id, error });
  }
  return (
    <TwPage>
      <ReportHead days={days} isOwner={workspace.role === 'owner'} sample={sample} />
      {data ? (
        <ReportBody report={data.report} truncated={data.truncated} sample={sample} />
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
