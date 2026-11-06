import { getLocale, getTranslations } from 'next-intl/server';
import { ReadinessView } from '../../../../components/readiness/readiness-view';
import { loadReadiness, readinessLangOf } from '../../../../server/readiness';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('readiness'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

/**
 * Độ sẵn sàng của AI (FR-146, US-107): chỉ Owner (Staff nhận 404). Chỉ đọc; số liệu lấy từ dữ liệu workspace
 * đang chọn qua `withActor`, không từ URL.
 */
export default async function ReadinessPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, locale] = await Promise.all([getTranslations('readiness'), getLocale()]);

  let result: Awaited<ReturnType<typeof loadReadiness>> | null = null;
  try {
    result = await loadReadiness(workspace.id, user.id, readinessLangOf(locale));
  } catch {
    // Không lộ chi tiết lỗi ra giao diện.
    result = null;
  }
  if (!result) {
    return (
      <main className="app-page" role="alert">
        <h1 className="auth-title">{t('error.title')}</h1>
        <p className="muted">{t('error.body')}</p>
      </main>
    );
  }

  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle', { min: result.minPercent })}</p>
      <p className="muted">{t('basisNote')}</p>
      <ReadinessView result={result} />
    </main>
  );
}
