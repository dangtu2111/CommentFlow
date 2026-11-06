import { notFound } from 'next/navigation';
import { PostsHeader } from '../../../../components/posts/posts-header';
import { PostsList, type PostsListItem } from '../../../../components/posts/posts-list';
import { PostsTabs } from '../../../../components/posts/posts-tabs';
import { PostsToolbar } from '../../../../components/posts/posts-toolbar';
import { Icon } from '../../../../components/ui/icon';
import { Pill } from '../../../../components/ui/pill';
import type { PostsView } from '../../../../lib/posts-filters';
import { SampleConfigPanel } from './sample-panel';

const VIEW: PostsView = { sort: 'pending', page: 1 };

const metaLine = 'flex items-center gap-1 font-label-md text-label-md';

const SAMPLE_POSTS: PostsListItem[] = [
  {
    id: 'mau-1',
    channelName: 'An Nhiên Store',
    platform: 'facebook',
    externalId: 'fb_post_89321487291',
    timeLabel: 'Vừa cập nhật 15 phút trước',
    title: 'BST Nắng Hè 2025 - Nét Dịu Dàng Nữ Tính',
    message:
      '"Nàng thơ mùa hạ gọi tên thiết kế hoa nhí cổ bồng siêu tôn dáng! Vải chiffon hàn 2 lớp thoáng mát tuyệt đối, không nhăn, sẵn size S M L cho chị em thử nha..."',
    permalink: null,
    isAd: true,
    createdTime: new Date('2026-11-05T03:24:00Z'),
    commentCount: 24,
    pendingCount: 24,
    badge: (
      <Pill tone="softError" shape="box">
        Chưa gắn sản phẩm
      </Pill>
    ),
    footer: (
      <div className="flex flex-col items-start justify-between gap-space-sm rounded-lg bg-secondary-fixed/50 p-space-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary">
            <Icon name="auto_awesome" size={12} />
          </span>
          <div>
            <span className="font-title-sm text-title-sm text-on-secondary-fixed">AI gợi ý: </span>
            <span className="font-title-sm text-title-sm font-bold text-secondary">
              Váy hoa nhí Vintage tay bồng (SKU: VHN-01)
            </span>
            <span className="ml-1 rounded-full bg-surface-container-lowest px-1.5 font-label-sm text-label-sm text-secondary">
              Độ tin cậy 94%
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
          <span
            className="flex cursor-not-allowed items-center gap-1 rounded bg-secondary px-2.5 py-1 font-label-sm text-label-sm text-on-secondary opacity-60"
            aria-disabled="true"
            title="Sắp có"
          >
            <Icon name="check" size={12} /> Xác nhận gắn
          </span>
          <span
            className="cursor-not-allowed rounded bg-surface-container px-2 py-1 font-label-sm text-label-sm text-on-surface-variant opacity-60"
            aria-disabled="true"
            title="Sắp có"
          >
            Bỏ qua
          </span>
        </div>
      </div>
    ),
  },
  {
    id: 'mau-2',
    channelName: '@annhien.official',
    platform: 'instagram',
    externalId: 'ig_post_mau_02',
    timeLabel: 'Đăng 2 ngày trước',
    title: 'Áo sơ mi linen cổ trụ mềm mát công sở & dạo phố',
    message: 'Tone màu kem be tối giản, phối cùng quần suông hay chân váy đều tinh tế...',
    permalink: null,
    isAd: false,
    createdTime: new Date('2026-11-04T03:24:00Z'),
    commentCount: 6,
    pendingCount: 6,
    badge: (
      <Pill tone="softPrimary" shape="box" className="font-semibold">
        Đã gắn 1 sản phẩm
      </Pill>
    ),
    footer: (
      <div className="flex flex-wrap items-center gap-space-md">
        <div className="flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface">
          <span className="text-primary">
            <Icon name="sell" size={12} />
          </span>
          <span>Chính: Áo Linen AL-02 (289.000đ)</span>
        </div>
        <span className="font-label-sm text-label-sm text-primary">AI: Tự động phản hồi</span>
      </div>
    ),
  },
  {
    id: 'mau-3',
    channelName: 'An Nhiên Shop',
    platform: 'tiktok',
    externalId: 'tt_post_mau_03',
    timeLabel: 'Đăng hôm qua',
    title: 'Video thử đồ thực tế: Đầm xòe công sở dạo phố',
    message: 'Cận cảnh chất vải dệt kim mềm rũ, form giấu eo cực đỉnh, các nàng xem hết clip nhé!',
    permalink: null,
    isAd: true,
    createdTime: new Date('2026-11-05T03:24:00Z'),
    commentCount: 15,
    pendingCount: 15,
    badge: (
      <Pill tone="accent" shape="box" className="font-semibold">
        AI gợi ý chờ duyệt
      </Pill>
    ),
    footer: (
      <div className="flex flex-wrap items-center gap-space-md">
        <Pill tone="outlineSecondary" shape="box">
          Gợi ý: Đầm xòe hoa nhí DX-11
        </Pill>
        <span className={`${metaLine} font-semibold text-error`}>
          <Icon name="error" size={12} /> 15 bình luận chờ
        </span>
      </div>
    ),
  },
  {
    id: 'mau-4',
    channelName: 'An Nhiên Store',
    platform: 'facebook',
    externalId: 'fb_live_mau_04',
    timeLabel: '10/11/2024',
    title: 'Livestream xả kho cuối tuần 10/11 - Tri ân khách hàng',
    message: 'Ghi chú: Đồng giá 149k trong live',
    permalink: null,
    isAd: false,
    createdTime: new Date('2026-11-01T03:24:00Z'),
    commentCount: 312,
    pendingCount: 0,
    badge: (
      <Pill tone="softPrimary" shape="box" className="font-semibold">
        Đã gắn: 3 sản phẩm
      </Pill>
    ),
    footer: (
      <div className="flex items-center gap-space-md font-label-sm text-label-sm text-on-surface-variant">
        <span>Đã phản hồi tự động: 312 bình luận</span>
        <span>• Tỉ lệ chốt đơn: 18.4%</span>
      </div>
    ),
  },
];

const CHANNELS = [
  { id: 'mau-ch-1', name: 'An Nhiên Store', platform: 'facebook' },
  { id: 'mau-ch-2', name: '@annhien.official', platform: 'instagram' },
];

/**
 * Trang xem giao diện Bài viết ĐỦ THÀNH PHẦN với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'` (UI-first
 * 06/11/2026, Q-TWKP1). Chữ lấy từ design/stitch/posts.html; nút chưa có chức năng vô hiệu "Sắp có". Dùng để đo
 * `pnpm ui:fidelity posts /dev/ui/kb-posts`.
 */
export default async function DevKbPostsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide">
      <div className="tw">
        <div className="space-y-space-lg">
          <p className="rounded-lg bg-tertiary-fixed px-space-md py-space-sm font-label-md text-label-md text-on-tertiary-fixed">
            [MẪU] Dữ liệu mẫu — không phải số liệu thật
          </p>
          <PostsHeader count={142} bulkCount={3} />
          <div className="flex flex-col items-start justify-between gap-space-md rounded-xl bg-tertiary-fixed p-space-md text-on-tertiary-fixed shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-center gap-space-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary-container text-on-tertiary-container">
                <Icon name="notification_important" size={20} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-title-sm text-title-sm text-on-tertiary-fixed">
                  <span>Phát hiện 12 bài viết chưa được liên kết với kho hàng</span>
                  <span className="h-2 w-2 rounded-full bg-error" />
                </div>
                <p className="font-body-sm text-body-sm text-on-tertiary-fixed-variant">
                  Hiện có <strong>48 bình luận hỏi giá & size</strong> đang ở trạng thái chờ duyệt
                  thủ công. Gắn sản phẩm ngay để mở khóa phản hồi tự động chuẩn xác từ AI!
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-space-sm self-end sm:self-center">
              <span
                className="cursor-not-allowed rounded-lg bg-tertiary-container px-3.5 py-1.5 font-title-sm text-title-sm text-on-tertiary opacity-60"
                aria-disabled="true"
                title="Sắp có"
              >
                Xem 12 bài này
              </span>
              <span className="p-1 text-on-tertiary-fixed-variant" title="Bỏ qua nhắc nhở">
                <Icon name="close" size={16} />
              </span>
            </div>
          </div>
          <div className="space-y-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-space-md">
              <PostsTabs
                view={VIEW}
                counts={{ all: 142, facebook: 86, instagram: 38, tiktok: 18 }}
              />
              <div className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
                <Icon name="history" size={16} />
                <span>Dữ liệu: 30 ngày gần nhất</span>
              </div>
            </div>
            <PostsToolbar
              view={VIEW}
              channels={CHANNELS}
              linkStateOptions={[
                'Trạng thái gắn: Tất cả',
                'Chưa gắn sản phẩm (12)',
                'AI gợi ý chờ duyệt (5)',
                'Đã gắn sản phẩm (125)',
              ]}
            />
          </div>
          <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
            <div className="lg:col-span-7">
              <PostsList
                view={VIEW}
                items={SAMPLE_POSTS}
                total={142}
                pageCount={12}
                timeZone="UTC"
              />
            </div>
            <SampleConfigPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
