import { getLocale, getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { KbPlayground } from '../../../../components/kb/kb-playground';
import { ReadinessOverview } from '../../../../components/readiness/readiness-overview';
import { ReadinessTestLab } from '../../../../components/readiness/readiness-test-lab';
import { Icon } from '../../../../components/ui/icon';
import { getBrand } from '../../../../server/brand';
import { loadReadiness, readinessLangOf } from '../../../../server/readiness';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: `${t('readiness.pageTitle')} · ${getBrand().name}` };
}

/**
 * Độ sẵn sàng AI & Bộ câu kiểm thử (Readiness & Test Lab; gộp trang Độ sẵn sàng FR-146 với trang Câu kiểm thử FR-054;
 * thiết kế `design/stitch/kb-readiness-lab.html`): chỉ Owner (Staff nhận 404). Điểm/trụ cột/gợi ý lấy từ dữ liệu workspace đang chọn
 * qua `withActor`; bộ câu kiểm thử và sandbox chạy AI thật bằng Server Action riêng (không trừ lượt gói). Không nhận workspace từ URL.
 */
export default async function ReadinessPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

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
        <h1 className="auth-title">{t('readiness.error.title')}</h1>
        <p className="muted">{t('readiness.error.body')}</p>
      </main>
    );
  }

  return (
    <main className="app-page app-page-wide">
      <KbFrame
        active="readiness"
        completeness={{
          score: result.score,
          ready: result.ready,
          minPercent: result.minPercent,
        }}
      >
        <div className="tw space-y-space-lg">
          <header className="space-y-1">
            <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">
              {t('readiness.pageTitle')}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('readiness.subtitle', { min: result.minPercent })}
            </p>
          </header>
          <ReadinessOverview result={result} />
          <ReadinessTestLab />
          <section
            aria-labelledby="lab-sandbox"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest p-space-lg shadow-sm"
          >
            <div className="flex items-center gap-space-sm">
              <span className="grid size-10 place-items-center rounded-lg bg-secondary-container text-on-secondary-container">
                <Icon name="science" size={20} />
              </span>
              <div>
                <h2
                  id="lab-sandbox"
                  className="font-title-md text-title-md font-semibold text-on-surface"
                >
                  {t('readiness.lab.sandbox.title')}
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('readiness.lab.sandbox.body')}
                </p>
              </div>
            </div>
            <KbPlayground
              label={t('kb.hub.playground.label')}
              placeholder={t('kb.hub.playground.placeholder')}
              submit={t('kb.hub.playground.run')}
              fullPageLabel={t('kb.hub.playground.full')}
            />
          </section>
        </div>
      </KbFrame>
    </main>
  );
}
