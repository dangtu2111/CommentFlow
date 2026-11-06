import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { kbSubnavFor } from '../../../../lib/kb-structure';
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
    <main className="app-page app-page-wide">
      <KbFrame active="kb">
        <header className="kb-head">
          <h1 className="auth-title">{t('title')}</h1>
          <p className="auth-subtitle">{t('subtitle')}</p>
        </header>
        <section className="kb-completeness" aria-labelledby="kb-completeness-title">
          <div className="kb-completeness-row">
            <h2 id="kb-completeness-title">{t('completeness')}</h2>
            <strong>{readiness.score}%</strong>
          </div>
          <progress
            value={readiness.score}
            max={100}
            aria-label={t('completenessAria', { score: readiness.score })}
          >
            {readiness.score}%
          </progress>
          <p className="muted">
            {readiness.ready
              ? t('completenessReady')
              : t('completenessNotReady', { min: readiness.minPercent })}{' '}
            · <Link href="/app/readiness">{t('completenessDetail')}</Link>
          </p>
        </section>
        <ul className="kb-cards">
          {kbSubnavFor().map((item) => (
            <li key={item.key} className="kb-card">
              <h2>{t(`cards.${item.key as 'productImport'}.title`)}</h2>
              <p className="muted">{t(`cards.${item.key as 'productImport'}.body`)}</p>
              <Link href={item.href} className="btn btn-secondary">
                {t('open')}
              </Link>
            </li>
          ))}
        </ul>
      </KbFrame>
    </main>
  );
}
