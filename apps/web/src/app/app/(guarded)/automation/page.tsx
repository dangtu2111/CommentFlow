import { getTranslations } from 'next-intl/server';
import { AutomationView } from '../../../../components/automation/automation-view';
import { Banner } from '../../../../components/ui/banner';
import { automationFormDefaults } from '../../../../lib/automation-form';
import { AUTOMATION_SAMPLE_METRICS } from '../../../../lib/automation-sample';
import { showSampleData } from '../../../../lib/sample-data';
import { automationSettings } from '../../../../server/automation-settings';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('automation'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const ERROR_FIELDS = [
  'rules',
  'threshold',
  'delaySeconds',
  'dailyCap',
  'activeHours',
  'blockedKeywords',
  'signature',
  'form',
  'unavailable',
] as const;

/**
 * Cài đặt tự gửi (FR-070/071): chỉ Owner (Staff nhận 404). Mặc định mọi ô Tắt. Q-AMU1: cấu hình đang lưu trong
 * bộ nhớ và chưa nối vào cổng tự gửi (chờ bảng `automation_settings` + PIPE-ROUTE) — trang nói rõ điều này.
 */
export default async function AutomationPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, params] = await Promise.all([getTranslations('automation'), searchParams]);
  const error = ERROR_FIELDS.find((f) => f === params.error) ?? null;

  let view: Awaited<ReturnType<ReturnType<typeof automationSettings>['load']>> | null = null;
  try {
    view = await automationSettings().load({ workspaceId: workspace.id, userId: user.id });
  } catch (error) {
    console.error('automation.load_failed', {
      workspaceId: workspace.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    view = null; // không lộ chi tiết lỗi ra giao diện
  }
  if (!view) {
    return (
      <main className="app-page" role="alert">
        <h1 className="auth-title">{t('loadError.title')}</h1>
        <p className="muted">{t('loadError.body')}</p>
      </main>
    );
  }

  const sample = showSampleData();
  return (
    <main className="app-page app-page-wide stack">
      <AutomationView
        channels={view.channels}
        defaults={automationFormDefaults(view.config)}
        metrics={sample ? AUTOMATION_SAMPLE_METRICS : null}
        notices={
          <>
            <Banner variant="warning">{t('notWired')}</Banner>
            {sample ? <Banner variant="info">{t('sampleBanner')}</Banner> : null}
            {params.saved === '1' ? <Banner variant="success">{t('notice.saved')}</Banner> : null}
            {error ? <Banner variant="danger">{t(`error.${error}`)}</Banner> : null}
          </>
        }
      />
    </main>
  );
}
