import { getTranslations } from 'next-intl/server';
import { AutomationForm } from '../../../../components/automation/automation-form';
import { automationFormDefaults } from '../../../../lib/automation-form';
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

  return (
    <main className="app-page app-page-wide stack">
      <header className="card auto-header">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">{t('subtitle')}</p>
      </header>
      <p role="note" className="banner banner-warning">
        {t('notWired')}
      </p>
      {params.saved === '1' ? <p role="status">{t('notice.saved')}</p> : null}
      {error ? <p role="alert">{t(`error.${error}`)}</p> : null}
      <AutomationForm channels={view.channels} defaults={automationFormDefaults(view.config)} />
    </main>
  );
}
