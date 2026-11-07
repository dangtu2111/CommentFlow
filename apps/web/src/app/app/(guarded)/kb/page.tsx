import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { KB_RAIL_ICONS, KbFrame } from '../../../../components/kb/kb-frame';
import { Icon } from '../../../../components/ui/icon';
import { kbSubnavFor } from '../../../../lib/kb-structure';
import { getBrand } from '../../../../server/brand';
import { loadReadiness, readinessLangOf } from '../../../../server/readiness';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('kb');
  return { title: `${t('pageTitle')} · ${getBrand().name}` };
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
      <KbFrame
        active="kb"
        completeness={{
          score: readiness.score,
          ready: readiness.ready,
          minPercent: readiness.minPercent,
        }}
      >
        <div className="tw space-y-space-xl">
          <header>
            <h1 className="font-headline-md text-headline-md text-on-surface">
              {t('overviewTitle')}
            </h1>
            <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
              {t('subtitle')}
            </p>
          </header>
          <ul className="grid gap-space-md sm:grid-cols-2 xl:grid-cols-3">
            {kbSubnavFor().map((item) => (
              <li
                key={item.key}
                className="flex flex-col items-start gap-space-sm rounded-xl bg-surface-container-lowest p-space-xl shadow-sm"
              >
                <span className="text-primary-container">
                  <Icon name={KB_RAIL_ICONS[item.key] ?? 'menu_book'} size={24} />
                </span>
                <h2 className="font-title-md text-title-md text-on-surface">
                  {t(`cards.${item.key as 'productImport'}.title`)}
                </h2>
                <p className="flex-1 font-body-sm text-body-sm text-on-surface-variant">
                  {t(`cards.${item.key as 'productImport'}.body`)}
                </p>
                <Link
                  href={item.href}
                  className="rounded-lg bg-surface-container px-3 py-2 font-title-sm text-title-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container-high"
                >
                  {t('open')}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </KbFrame>
    </main>
  );
}
