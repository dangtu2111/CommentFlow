import { notFound } from 'next/navigation';
import type { ActivityListItem } from '../../../../components/activity/activity-list';
import { ActivityPageView } from '../../../../components/activity/activity-view';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { parseActivitySearchParams } from '../../../../lib/action-log-filters';

const TZ = 'Asia/Ho_Chi_Minh';
const VIEWER = 'u1';
const SAMPLE_TARGET = 'sample-comment-1';
const NOW = new Date('2026-11-06T10:30:00Z');
const at = (m: number) => new Date(NOW.getTime() - m * 60_000);

const none = { onBehalfOfId: null, onBehalfOfName: null } as const;

const ITEMS: ActivityListItem[] = [
  {
    id: 'a1',
    createdAt: at(2),
    actorType: 'ai',
    actorName: null,
    ...none,
    action: 'comment.hidden',
    targetType: 'comment',
    sample: {
      channel: 'FB: An Nhiên Store',
      channelDot: 'primary',
      post: 'Post: BST Nắng Hè 2025',
      payload: 'Bảo vệ SĐT: `0912.839.442`',
      payloadSub: 'Chuyển thành Lead #L-8942',
      result: 'Thành công',
    },
  },
  {
    id: 'a2',
    createdAt: at(9),
    actorType: 'user',
    actorName: '[MẪU] Nguyễn Mai Linh',
    ...none,
    action: 'comment.reply_requested',
    targetType: 'comment',
    sample: {
      channel: 'IG: @annhien.official',
      channelDot: 'secondary',
      post: 'Direct: @hoangle_94',
      payload: 'Đổi giá KM đầm lụa: 389.000đ',
      payloadSub: 'Sửa gợi ý AI: Thêm freeship',
      result: 'Thành công',
    },
  },
  {
    id: 'a3',
    createdAt: at(31),
    actorType: 'system',
    actorName: null,
    onBehalfOfId: 'u1',
    onBehalfOfName: '[MẪU] Nguyễn Mai Linh',
    action: 'comment.hide_requested',
    targetType: 'comment',
    sample: {
      channel: 'FB: An Nhiên Store',
      channelDot: 'primary',
      post: 'Comment ID: 492049281...',
      payload: 'GraphAPI Error #190: OAuth Token',
      payloadSub: 'Hệ thống đã xếp hàng chờ gửi lại',
      failed: true,
      result: 'Thất bại (500)',
    },
  },
  {
    id: 'a4',
    createdAt: at(75),
    actorType: 'user',
    actorName: '[MẪU] Trần Quốc Huy',
    ...none,
    action: 'member.role_changed',
    targetType: 'member',
  },
  {
    id: 'a5',
    createdAt: at(140),
    actorType: 'admin',
    actorName: null,
    ...none,
    action: 'channel.reconnected',
    targetType: 'channel',
  },
];

/** Trang xem giao diện Nhật ký với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'`; dùng đúng `ActivityPageView` của trang thật. */
export default function DevActivityPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const view = parseActivitySearchParams({});
  const first = ITEMS[0];
  if (!first) notFound();
  return (
    <DevShell>
      <main className="tw w-full">
        <div className="flex w-full flex-col">
          <p
            className="px-space-xl pt-space-sm font-label-md text-label-md text-on-surface-variant"
            role="note"
          >
            {DEV_SAMPLE_NOTE}
          </p>
          <ActivityPageView
            view={view}
            items={ITEMS}
            nextCursor={null}
            actions={[]}
            timeZone={TZ}
            viewerId={VIEWER}
            isOwner
            detail={{
              ...first,
              targetId: SAMPLE_TARGET,
              before: { is_hidden: false },
              after: { is_hidden: true },
            }}
            selectedMissing={false}
            sample
          />
        </div>
      </main>
    </DevShell>
  );
}
