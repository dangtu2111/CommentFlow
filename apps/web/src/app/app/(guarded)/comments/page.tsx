import { getTranslations } from 'next-intl/server';
import { CommentDetailPanel } from '../../../../components/comments/comment-detail';
import { BackLink, EmptyNote } from '../../../../components/comments/empty-note';
import { InboxList } from '../../../../components/comments/inbox-list';
import { InboxStrip } from '../../../../components/comments/inbox-strip';
import { InboxTabs } from '../../../../components/comments/inbox-tabs';
import { InboxToolbar } from '../../../../components/comments/inbox-toolbar';
import {
  Workbench,
  WorkbenchDetail,
  WorkbenchFilters,
  WorkbenchList,
} from '../../../../components/ui/workbench';
import { parseInboxSearchParams } from '../../../../lib/inbox-filters';
import { buildInboxBackHref, inboxMobilePane } from '../../../../lib/inbox-pane';
import { loadInbox } from '../../../../server/inbox';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('comments');
  return { title: t('title') };
}

/**
 * Trang Bình luận (FR-040): tab trạng thái · danh sách · khung chi tiết. Server Component; bộ lọc là tham số URL
 * (GET form) nên dùng được khi tắt JavaScript. Mọi truy vấn dùng workspace/người dùng từ `requireAppUser`.
 */
export default async function CommentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await requireAppUser({});
  const [t, params] = await Promise.all([getTranslations('comments'), searchParams]);
  const view = parseInboxSearchParams(params);

  let data: Awaited<ReturnType<typeof loadInbox>> | null = null;
  try {
    data = await loadInbox(workspace.id, user.id, view);
  } catch {
    // Không lộ chi tiết lỗi ra giao diện; hiện thông báo chung.
    data = null;
  }
  if (!data) {
    return (
      <div className="tw">
        <main className="mx-auto max-w-xl p-margin text-center" role="alert">
          <h1 className="font-headline-sm text-headline-sm text-on-surface">{t('error.title')}</h1>
          <p className="mt-space-sm font-body-md text-body-md text-on-surface-variant">
            {t('error.body')}
          </p>
        </main>
      </div>
    );
  }

  const { page, counts, channels, timeZone, detail } = data;
  const now = new Date();
  const filtered = Boolean(view.platform || view.channelId || view.adsOnly || view.search);
  return (
    <Workbench strip={<InboxStrip />} pane={inboxMobilePane(view)}>
      <WorkbenchFilters>
        <InboxTabs view={view} counts={counts} />
      </WorkbenchFilters>
      <WorkbenchList label={t('list.label')}>
        <InboxToolbar view={view} channels={channels} />
        {page.items.length === 0 ? (
          <EmptyNote
            title={filtered || counts.all > 0 ? t('empty.filteredTitle') : t('empty.title')}
            body={filtered || counts.all > 0 ? t('empty.filteredBody') : t('empty.body')}
          />
        ) : (
          <InboxList
            view={view}
            items={page.items}
            total={counts[view.tab]}
            nextCursor={page.nextCursor}
            timeZone={timeZone}
            now={now}
          />
        )}
      </WorkbenchList>
      <WorkbenchDetail label={t('detail.title')}>
        {view.selected ? (
          <BackLink href={buildInboxBackHref(view)}>{t('detail.back')}</BackLink>
        ) : null}
        {detail ? (
          // key = id: đổi bình luận → gắn lại panel (mở khóa cái cũ, lấy khóa cái mới).
          <CommentDetailPanel key={detail.id} comment={detail} timeZone={timeZone} now={now} />
        ) : view.selected ? (
          <EmptyNote
            role="alert"
            title={t('detail.notFoundTitle')}
            body={t('detail.notFoundBody')}
          />
        ) : (
          <p className="p-6 text-center font-body-md text-body-md text-on-surface-variant">
            {t('detail.empty')}
          </p>
        )}
      </WorkbenchDetail>
    </Workbench>
  );
}
