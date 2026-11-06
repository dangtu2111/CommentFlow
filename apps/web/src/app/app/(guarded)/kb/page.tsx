import { getLocale, getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { KbHubView } from '../../../../components/kb/kb-hub-view';
import { loadReadiness, readinessLangOf } from '../../../../server/readiness';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('kb'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

/**
 * Cơ sở kiến thức — trang trung tâm (QUKP1): chỉ Owner. Chỉ hiển thị số liệu THẬT: độ đầy đủ lấy từ
 * `loadReadiness` (cùng nguồn trang Độ sẵn sàng); các khối thiết kế chưa có dữ liệu thì không dựng ở đây.
 */
export default async function KbHubPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, locale] = await Promise.all([getTranslations('kb'), getLocale()]);

  let readiness: Awaited<ReturnType<typeof loadReadiness>> | null = null;
  try {
    readiness = await loadReadiness(workspace.id, user.id, readinessLangOf(locale));
  } catch {
    readiness = null;
  }
  if (!readiness) {
    return (
      <main className="app-page" role="alert">
        <h1 className="auth-title">{t('error.title')}</h1>
        <p className="muted">{t('error.body')}</p>
      </main>
    );
  }

  return (
    <main className="app-page app-page-kb">
      <KbFrame active="kb">
        <KbHubView
          score={readiness.score}
          ready={readiness.ready}
          minPercent={readiness.minPercent}
        />
      </KbFrame>
    </main>
  );
}
