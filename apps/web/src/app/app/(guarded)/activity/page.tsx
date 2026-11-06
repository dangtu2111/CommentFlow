import { Lock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ActivityDetailPanel } from '../../../../components/activity/activity-detail';
import { ActivityList } from '../../../../components/activity/activity-list';
import { ActivityToolbar } from '../../../../components/activity/activity-toolbar';
import { Chip } from '../../../../components/ui/chip';
import { PageHeader } from '../../../../components/ui/page-header';
import { parseActivitySearchParams } from '../../../../lib/action-log-filters';
import { loadActionLog } from '../../../../server/action-log';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('activity');
  return { title: t('title') };
}

/**
 * Trang Nhật ký (FR-092): chỉ đọc. Owner thấy mọi dòng của workspace, Staff chỉ dòng của chính mình. Bộ lọc là tham số
 * URL (GET form). Workspace/người dùng/vai trò lấy từ `requireAppUser`, không từ URL.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await requireAppUser({});
  const [t, params] = await Promise.all([getTranslations('activity'), searchParams]);
  const view = parseActivitySearchParams(params);

  let data: Awaited<ReturnType<typeof loadActionLog>> | null = null;
  try {
    data = await loadActionLog(workspace.id, user.id, workspace.role, view);
  } catch {
    data = null; // Không lộ chi tiết lỗi ra giao diện.
  }
  if (!data) {
    return (
      <main className="log-page log-error" role="alert">
        <h1>{t('error.title')}</h1>
        <p>{t('error.body')}</p>
      </main>
    );
  }

  const { page, actions, timeZone, detail } = data;
  const filtered = Boolean(view.actorType || view.action || view.fromDate || view.toDate);
  const isOwner = workspace.role === 'owner';
  return (
    <main className="log-page">
      <div className="log-header">
        <PageHeader
          title={t('title')}
          subtitle={isOwner ? t('subtitle.owner') : t('subtitle.staff')}
        />
        <Chip>
          <Lock size={12} aria-hidden="true" /> {t('readOnly')}
        </Chip>
      </div>
      <section className="log-list" aria-label={t('list.label')}>
        <ActivityToolbar view={view} actions={actions} showActor={isOwner} />
        {page.items.length === 0 ? (
          <div className="inbox-empty">
            <h2>{filtered ? t('empty.filteredTitle') : t('empty.title')}</h2>
            <p>{filtered ? t('empty.filteredBody') : t('empty.body')}</p>
          </div>
        ) : (
          <ActivityList
            view={view}
            items={page.items}
            nextCursor={page.nextCursor}
            timeZone={timeZone}
            viewerId={user.id}
          />
        )}
      </section>
      <aside className="log-detail" aria-label={t('detail.title')}>
        {detail ? (
          <ActivityDetailPanel entry={detail} timeZone={timeZone} viewerId={user.id} />
        ) : view.selected ? (
          <div className="inbox-empty" role="alert">
            <h2>{t('detail.notFoundTitle')}</h2>
            <p>{t('detail.notFoundBody')}</p>
          </div>
        ) : (
          <p>{t('detail.empty')}</p>
        )}
      </aside>
    </main>
  );
}
