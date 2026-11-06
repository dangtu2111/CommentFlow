import { getTranslations } from 'next-intl/server';
import { KbPublishForm } from '../../../../components/kb-publish/kb-publish-form';
import { kbPublish } from '../../../../server/kb-publish';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('kbPublish'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
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
  const { preview, versions, currentNumber } = overview;
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle')}</p>
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
    </main>
  );
}
