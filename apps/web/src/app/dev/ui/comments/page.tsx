import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NotificationBell } from '../../../../components/app/notification-bell';
import { ShellNav } from '../../../../components/app/shell-nav';
import { ShellQuotaCard } from '../../../../components/app/shell-quota-card';
import { UserCard } from '../../../../components/app/user-card';
import { BrandLogo } from '../../../../components/brand-logo';
import {
  CommentDetailPanel,
  type CommentDetailView,
} from '../../../../components/comments/comment-detail';
import { InboxList, type InboxListItem } from '../../../../components/comments/inbox-list';
import { InboxTabs } from '../../../../components/comments/inbox-tabs';
import { InboxToolbar } from '../../../../components/comments/inbox-toolbar';
import { LocaleSwitcher } from '../../../../components/locale-switcher';
import { navGroupsFor } from '../../../../lib/app-nav';
import { INBOX_TAB_KEYS, type InboxTabKey, type InboxView } from '../../../../lib/inbox-filters';
import { buildNotifications } from '../../../../lib/notification-model';
import { buildUsageMeterView } from '../../../../lib/usage-meter-view';

const SAMPLE_TZ = 'Asia/Ho_Chi_Minh';
const SAMPLE_NOTE = '[MẪU] Dữ liệu mẫu — không phải số liệu thật';
const CHANNEL = '[MẪU] Cửa hàng mẫu';
const NOW = new Date('2026-11-06T10:30:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** Dữ liệu MẪU cho trang xem giao diện — không đọc DB, không phải số liệu thật. */
const SAMPLE_ITEMS: InboxListItem[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'pending_review',
    text: 'Váy hoa nhí tay bồng này còn size M màu be không shop? Giá bao nhiêu vậy ạ?',
    authorName: 'Lê Phương Thảo',
    createdTime: minutesAgo(5),
    label: 'price',
    needsFollowup: false,
    channelName: CHANNEL,
    platform: 'facebook',
    isAd: false,
    lockedByName: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    status: 'pending_review',
    text: 'Cho mình đặt 1 áo sơ mi trắng size L nhé, ship về Cầu Giấy Hà Nội',
    authorName: 'Trần Quốc Huy',
    createdTime: minutesAgo(12),
    label: 'purchase',
    needsFollowup: false,
    channelName: CHANNEL,
    platform: 'instagram',
    isAd: false,
    lockedByName: 'Nhân viên mẫu',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    status: 'pending_review',
    text: 'Áo này chất vải gì vậy shop có bị xù lông không?',
    authorName: 'Nguyễn Hoàng Long',
    createdTime: minutesAgo(28),
    label: 'advice',
    needsFollowup: false,
    channelName: CHANNEL,
    platform: 'tiktok',
    isAd: true,
    lockedByName: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    status: 'needs_human',
    text: 'Hàng giao chậm quá 4 ngày chưa thấy đâu',
    authorName: null,
    createdTime: minutesAgo(45),
    label: 'complaint',
    needsFollowup: true,
    channelName: CHANNEL,
    platform: 'facebook',
    isAd: false,
    lockedByName: null,
  },
];

const SAMPLE_COUNTS = Object.fromEntries(INBOX_TAB_KEYS.map((tab) => [tab, 0])) as Record<
  InboxTabKey,
  number
>;
SAMPLE_COUNTS.pending_review = 3;
SAMPLE_COUNTS.needs_human = 1;
SAMPLE_COUNTS.all = SAMPLE_ITEMS.length;

function sampleDetail(item: InboxListItem): CommentDetailView {
  return {
    id: item.id,
    status: item.status,
    text: item.text,
    authorName: item.authorName,
    authorExternalId: 'mau.0001',
    createdTime: item.createdTime,
    label: item.label,
    needsFollowup: item.needsFollowup,
    parentExternalId: null,
    channelName: item.channelName,
    platform: item.platform,
    postExternalId: 'mau_post_001',
    isAd: item.isAd,
    channelStatus: 'connected',
    deletedAt: null,
    isHidden: false,
    latestHide: null,
    latestReply: null,
    lock: null,
    suggestion: {
      text: '[MẪU] Dạ chào bạn! Mẫu này shop còn size M màu be ạ. Bạn nhắn shop để được tư vấn thêm nhé.',
      sourceIds: ['mau-1'],
      sourceTitles: { 'mau-1': '[MẪU] Chính sách đổi trả' },
      needsHuman: false,
    },
  };
}

/**
 * Trang xem giao diện hộp thư Bình luận với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'` (UI-first 06/11/2026).
 * Không DB, không phiên; mọi nội dung là mẫu, gắn nhãn "[MẪU]".
 */
export default async function DevCommentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const [t, params] = await Promise.all([getTranslations(), searchParams]);
  const rawSelected = params.c;
  const selectedId = Array.isArray(rawSelected) ? rawSelected[0] : rawSelected;
  const selected = SAMPLE_ITEMS.find((i) => i.id === selectedId) ?? SAMPLE_ITEMS[0];
  if (!selected) notFound();
  const view: InboxView = {
    tab: 'pending_review',
    sort: 'oldest',
    cursor: null,
    selected: undefined,
  };
  const groups = navGroupsFor('owner').map((group) => ({
    key: group.key,
    label: t(`shell.groups.${group.key}`),
    items: group.items.map((item) => ({ ...item, label: t(`shell.nav.${item.key}`) })),
  }));
  return (
    <div className="shell">
      <header className="shell-top">
        <BrandLogo href="/dev/ui" />
        <span className="chip-live">{CHANNEL}</span>
        <div className="shell-top-end">
          <LocaleSwitcher />
          <NotificationBell model={buildNotifications([], null)} canOpenChannels />
        </div>
      </header>
      <div className="shell-body">
        <ShellNav
          groups={groups}
          label={t('shell.navLabel')}
          quota={<ShellQuotaCard view={buildUsageMeterView({ used: 2140, limit: 3000 })} />}
          footer={
            <UserCard name="[MẪU] Nguyễn Mai Linh" roleLabel={t('workspace.switcher.role.owner')} />
          }
        />
        <div className="shell-main">
          <main className="inbox" data-pane={params.c ? 'detail' : 'list'}>
            <InboxTabs view={view} counts={SAMPLE_COUNTS} />
            <section className="inbox-list" aria-label={t('comments.list.label')}>
              <InboxToolbar view={view} channels={[]} />
              <p className="inbox-sample-note" role="note">
                {SAMPLE_NOTE}
              </p>
              <InboxList
                view={view}
                items={SAMPLE_ITEMS}
                total={SAMPLE_ITEMS.length}
                nextCursor={null}
                timeZone={SAMPLE_TZ}
                now={NOW}
              />
            </section>
            <aside className="inbox-detail" aria-label={t('comments.detail.title')}>
              <Link href="/dev/ui/comments" className="inbox-back">
                {t('comments.detail.back')}
              </Link>
              <CommentDetailPanel
                key={selected.id}
                comment={sampleDetail(selected)}
                timeZone={SAMPLE_TZ}
                now={NOW}
                preview
              />
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}
