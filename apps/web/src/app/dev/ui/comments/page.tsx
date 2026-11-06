import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NotificationBell } from '../../../../components/app/notification-bell';
import { ShellNav } from '../../../../components/app/shell-nav';
import { ShellQuotaCard } from '../../../../components/app/shell-quota-card';
import { UserCard } from '../../../../components/app/user-card';
import { BrandLogo } from '../../../../components/brand-logo';
import {
  type CommentDetailExtras,
  CommentDetailPanel,
  type CommentDetailView,
} from '../../../../components/comments/comment-detail';
import { BackLink } from '../../../../components/comments/empty-note';
import { InboxList, type InboxListItem } from '../../../../components/comments/inbox-list';
import { InboxStrip } from '../../../../components/comments/inbox-strip';
import { InboxTabs } from '../../../../components/comments/inbox-tabs';
import { InboxToolbar } from '../../../../components/comments/inbox-toolbar';
import { LocaleSwitcher } from '../../../../components/locale-switcher';
import {
  Workbench,
  WorkbenchDetail,
  WorkbenchFilters,
  WorkbenchList,
} from '../../../../components/ui/workbench';
import { navGroupsFor } from '../../../../lib/app-nav';
import { INBOX_TAB_KEYS, type InboxTabKey, type InboxView } from '../../../../lib/inbox-filters';
import { buildNotifications } from '../../../../lib/notification-model';
import { buildUsageMeterView } from '../../../../lib/usage-meter-view';

const SAMPLE_TZ = 'Asia/Ho_Chi_Minh';
const SAMPLE_NOTE = '[MẪU] Dữ liệu mẫu — không phải số liệu thật';
const CHANNEL = '[MẪU] Cửa hàng mẫu';
const NOW = new Date('2026-11-06T10:30:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/**
 * Dữ liệu MẪU cho trang xem giao diện — không đọc DB, không phải số liệu thật. Chuỗi lấy đúng từ HTML Stitch
 * (`design/stitch/comments.html`) để bản dựng và thiết kế giống nhau; cả trang mang nhãn "[MẪU]".
 */
const SAMPLE_ITEMS: InboxListItem[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'pending_review',
    text: '"Váy hoa nhí tay bồng này còn size M màu be không shop? Giá bao nhiêu vậy ạ?"',
    authorName: 'Lê Phương Thảo',
    createdTime: minutesAgo(5),
    label: 'price',
    needsFollowup: false,
    channelName: 'An Nhiên Store',
    platform: 'facebook',
    isAd: false,
    lockedByName: null,
    extras: { hasAiDraft: true, turn: 1 },
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    status: 'pending_review',
    text: '"Cho mình đặt 1 áo sơ mi trắng size L nhé, ship về Cầu Giấy Hà Nội"',
    authorName: 'Trần Quốc Huy',
    createdTime: minutesAgo(12),
    label: 'purchase',
    needsFollowup: false,
    channelName: '@annhien.official',
    platform: 'instagram',
    isAd: false,
    lockedByName: 'An',
    extras: { labelSuffix: ' (Ưu tiên)', sideNote: 'COD • Hà Nội' },
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    status: 'pending_review',
    text: '"Áo này chất vải gì vậy shop có bị xù lông không?"',
    authorName: 'Nguyễn Hoàng Long',
    createdTime: minutesAgo(28),
    label: 'advice',
    needsFollowup: false,
    channelName: 'TikTok Shop Live',
    platform: 'tiktok',
    isAd: true,
    lockedByName: null,
    extras: { sideNote: 'Chiến dịch T5' },
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    status: 'needs_human',
    text: '"Hàng giao chậm quá 4 ngày chưa thấy đâu"',
    authorName: 'Facebook User (Ẩn danh)',
    createdTime: minutesAgo(45),
    label: 'complaint',
    needsFollowup: false,
    channelName: 'An Nhiên Store',
    platform: 'facebook',
    isAd: false,
    lockedByName: null,
    extras: { labelSuffix: ' (Cần gấp)', sideNote: 'Chờ CSKH' },
  },
];

const SAMPLE_COUNTS = Object.fromEntries(INBOX_TAB_KEYS.map((tab) => [tab, 0])) as Record<
  InboxTabKey,
  number
>;
Object.assign(SAMPLE_COUNTS, {
  scheduled_auto: 3,
  auto_replied: 142,
  pending_review: 18,
  needs_human: 6,
  spam_suspected: 2,
  replied: 854,
  hidden: 27,
  all: 1052,
});

const SAMPLE_REPLY =
  'Dạ chào bạn Thảo! Mẫu Váy hoa nhí tay bồng màu be hiện tại shop vẫn còn sẵn size M bạn nha. Giá sản phẩm là 349.000đ và đang được miễn phí vận chuyển toàn quốc hôm nay ạ. Bạn có muốn shop giữ mẫu này cho bạn không ạ?';

const SAMPLE_EXTRAS: CommentDetailExtras = {
  post: {
    title:
      'Bộ sưu tập Mùa Hè 2025 - Váy hoa nhí Vintage thanh lịch, form dáng chuẩn công sở & dạo phố',
    product: 'Váy hoa nhí tay bồng Vintage (SKU: VHN-01 - 349.000đ)',
    stock: 'Đã bán 142 • Tồn kho: 8',
  },
  customer: {
    badge: 'Khách VIP Tiềm Năng',
    meta: 'Bình luận lúc 10:24 hôm nay • ID: @thao.le92',
    history: 'Đã bình luận 2 lần trên trang',
    purchase: 'Đã mua 1 đơn tháng trước (Đơn #AN-8891: Váy Linen Cổ Vuông)',
  },
  ai: {
    confidence: 'Độ tin cậy: Cao (96%)',
    reason:
      'Khách hỏi giá và tồn kho sản phẩm trong bài viết. Phát hiện từ khóa: "còn size M màu be không", "giá bao nhiêu".',
  },
};

function sampleDetail(item: InboxListItem): CommentDetailView {
  const isFirst = item.id === SAMPLE_ITEMS[0]?.id;
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
    suggestion: isFirst
      ? {
          text: SAMPLE_REPLY,
          sourceIds: ['mau-1', 'mau-2', 'mau-3'],
          sourceTitles: {
            'mau-1': 'Sản phẩm: Váy hoa nhí Vintage',
            'mau-2': 'Chính sách: Miễn phí ship từ 300k',
            'mau-3': 'Tồn kho: Size M Be (8 chiếc)',
          },
          needsHuman: false,
        }
      : {
          text: '[MẪU] Dạ chào bạn! Shop đã nhận được bình luận và sẽ phản hồi ngay ạ.',
          sourceIds: [],
          sourceTitles: {},
          needsHuman: false,
        },
    extras: isFirst ? SAMPLE_EXTRAS : undefined,
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
          <Workbench
            strip={<InboxStrip sample={{ session: 'Ca Sáng (08:00 - 16:30)', sla: '4 phút' }} />}
            pane={params.c ? 'detail' : 'list'}
          >
            <WorkbenchFilters>
              <InboxTabs
                view={view}
                counts={SAMPLE_COUNTS}
                aiHealth={{
                  accuracy: '98.4%',
                  note: 'Đang áp dụng 14 rules ngữ cảnh & bảng giá T5/2025',
                }}
              />
            </WorkbenchFilters>
            <WorkbenchList label={t('comments.list.label')}>
              <InboxToolbar
                view={view}
                channels={[]}
                sample={{ priorityNote: 'Ưu tiên: Mua & Khiếu nại', newCount: 2 }}
              />
              <p
                className="bg-tertiary-fixed px-3 py-1 text-center font-label-sm text-label-sm text-on-tertiary-fixed-variant"
                role="note"
              >
                {SAMPLE_NOTE}
              </p>
              <InboxList
                view={view}
                items={SAMPLE_ITEMS}
                total={SAMPLE_COUNTS.pending_review}
                nextCursor={null}
                timeZone={SAMPLE_TZ}
                now={NOW}
              />
            </WorkbenchList>
            <WorkbenchDetail label={t('comments.detail.title')}>
              <BackLink href="/dev/ui/comments">{t('comments.detail.back')}</BackLink>
              <CommentDetailPanel
                key={selected.id}
                comment={sampleDetail(selected)}
                timeZone={SAMPLE_TZ}
                now={NOW}
                preview
              />
            </WorkbenchDetail>
          </Workbench>
        </div>
      </div>
    </div>
  );
}
