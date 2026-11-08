import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { KbPublishForm } from '../../../../components/kb-publish/kb-publish-form';
import { PageHeader } from '../../../../components/ui/page-header';
import { getBrand } from '../../../../server/brand';
import { kbPublish } from '../../../../server/kb-publish';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('kbPublish');
  return { title: `${t('pageTitle')} · ${getBrand().name}` };
}

/**
 * Phiên bản kiến thức (FR-054, UF-8, US-035): chỉ Owner (Staff nhận 404). Xem thay đổi của bản nháp so với phiên bản
 * đang chạy → Xuất bản; danh sách phiên bản → Khôi phục (tạo phiên bản mới, không sửa bản cũ).
 */
export default async function KbPublishPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const t = await getTranslations('kbPublish');
  let overview: Awaited<ReturnType<ReturnType<typeof kbPublish>['overview']>> | null = null;
  try {
    overview = await kbPublish().overview({ workspaceId: workspace.id, userId: user.id });
  } catch {
    overview = null; // không lộ chi tiết lỗi ra giao diện
  }
  if (!overview) {
    return (
      <main className="app-page" role="alert">
        <h1 className="auth-title">{t('loadError.title')}</h1>
        <p className="muted">{t('loadError.body')}</p>
      </main>
    );
  }
  const { preview, versions, currentNumber, conflicts } = overview;
  // Chủ đề nào có nhãn dịch thì dùng, không thì hiện mã chung.
  const topicLabel = (topic: string) =>
    t.has(`conflicts.topics.${topic}`) ? t(`conflicts.topics.${topic}`) : topic;
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbPublish">
        <header className="kb-head">
          <PageHeader title={t('title')} subtitle={t('subtitle')} />
        </header>
        {currentNumber === null && preview.ok ? (
          <div className="tw">
            <div
              role="status"
              className="mb-4 rounded-xl bg-tertiary-fixed px-4 py-3 text-on-tertiary-fixed-variant"
            >
              <p className="font-label-md text-label-md">{t('unpublishedBanner.title')}</p>
              <p className="font-body-sm text-body-sm">{t('unpublishedBanner.body')}</p>
            </div>
          </div>
        ) : null}
        {conflicts.length > 0 ? (
          <div className="tw">
            <section
              role="alert"
              aria-labelledby="kb-conflicts-title"
              className="mb-4 space-y-3 rounded-xl bg-error-container px-4 py-3 text-on-error-container"
            >
              <h2 id="kb-conflicts-title" className="font-label-md text-label-md">
                {t('conflicts.title')}
              </h2>
              <p className="font-body-sm text-body-sm">{t('conflicts.body')}</p>
              {conflicts.map((group) => (
                <div key={group.group} className="space-y-1">
                  <p className="font-label-md text-label-md">
                    {topicLabel(group.topic)} —{' '}
                    {t('conflicts.valuesLabel', { values: group.values.join(' / ') })}
                  </p>
                  <ul className="list-disc space-y-1 pl-5 font-body-sm text-body-sm">
                    {group.members.map((m) => (
                      <li key={`${m.chunkKey}:${m.value}`}>
                        “{m.sentence}” <span className="opacity-80">({m.sourceTitle})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>
        ) : null}
        <KbPublishForm
          currentNumber={currentNumber}
          preview={
            preview.ok
              ? {
                  added: preview.added,
                  changed: preview.changed,
                  removed: preview.removed,
                  blockedInjection: preview.blockedInjection,
                  categories: preview.changedCategories,
                  needsConfirm: preview.needsConfirm,
                }
              : null
          }
          versions={versions.map((v) => ({
            number: v.number,
            publishedAt: v.publishedAt.toISOString(),
            note: v.note,
            categories: v.changedCategories,
            chunkCount: v.chunkCount,
          }))}
        />
      </KbFrame>
    </main>
  );
}
