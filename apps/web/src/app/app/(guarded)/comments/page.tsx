import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CommentDetailPanel } from '../../../../components/comments/comment-detail';
import { InboxList } from '../../../../components/comments/inbox-list';
import { InboxTabs } from '../../../../components/comments/inbox-tabs';
import { InboxToolbar } from '../../../../components/comments/inbox-toolbar';
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
      <main className="inbox inbox-error" role="alert">
        <h1>{t('error.title')}</h1>
        <p>{t('error.body')}</p>
      </main>
    );
  }

  const { page, counts, channels, timeZone, detail } = data;
  const now = new Date();
  const filtered = Boolean(view.platform || view.channelId || view.adsOnly || view.search);
  return (
    <main className="inbox" data-pane={inboxMobilePane(view)}>
      <InboxTabs view={view} counts={counts} />
      <section className="inbox-list" aria-label={t('list.label')}>
        <InboxToolbar view={view} channels={channels} />
        {page.items.length === 0 ? (
          <div className="inbox-empty">
            <h2>{filtered || counts.all > 0 ? t('empty.filteredTitle') : t('empty.title')}</h2>
            <p>{filtered || counts.all > 0 ? t('empty.filteredBody') : t('empty.body')}</p>
          </div>
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
      </section>
      <aside className="inbox-detail" aria-label={t('detail.title')}>
        {view.selected ? (
          <Link href={buildInboxBackHref(view)} className="inbox-back">
            {t('detail.back')}
          </Link>
        ) : null}
        {detail ? (
          // key = id: đổi bình luận → gắn lại panel (mở khóa cái cũ, lấy khóa cái mới).
          <CommentDetailPanel key={detail.id} comment={detail} timeZone={timeZone} now={now} />
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
