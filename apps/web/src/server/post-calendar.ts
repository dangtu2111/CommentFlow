import {
  type CalendarPost,
  type ChannelListItem,
  eq,
  getPublishPost,
  getPublishPostNote,
  listChannels,
  listPickableProducts,
  listPostsForWeek,
  listPublishDrafts,
  listPublishPostMedia,
  listPublishPostProductIds,
  listPublishPostsForWeek,
  type MediaAssetRow,
  type PickableProduct,
  type PublishPostItem,
  schema,
} from '@flow/db/runtime';
import { isValidTimezone } from '@flow/shared';
import { outcomeOf, type PublishOutcome } from '../lib/publish-outcome';
import { getDb } from './db';

export type CalendarData = {
  posts: CalendarPost[];
  /** Bài đăng từ CommentFlow (đã lên lịch/đang đăng/đã đăng/lỗi) của tuần. */
  publish: PublishPostItem[];
  drafts: PublishPostItem[];
  channels: ChannelListItem[];
  timeZone: string;
};
export type ComposerData = {
  channels: ChannelListItem[];
  timeZone: string;
  /** Bài đang sửa (`?id=`); `null` = bài mới hoặc không tìm thấy. */
  post: PublishPostItem | null;
  /** Sản phẩm đang bán để chọn gắn vào bài, và các sản phẩm đã gắn vào bài đang sửa. */
  products: PickableProduct[];
  selectedProductIds: string[];
  /** Ảnh/video đã gắn vào bài đang sửa (theo thứ tự). */
  media: MediaAssetRow[];
  /** Ghi chú riêng cho AI của bài đang sửa. */
  aiNote: string | null;
};

const FALLBACK_TIME_ZONE = 'UTC';

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['withActor']>[2]>[0];

async function workspaceTimeZone(tx: Tx, workspaceId: string): Promise<string> {
  const rows = await tx
    .select({ timezone: schema.workspaces.timezone })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  const zone = rows[0]?.timezone;
  return zone && isValidTimezone(zone) ? zone : FALLBACK_TIME_ZONE;
}

/** Múi giờ của workspace (để đổi giờ lên lịch nhập theo giờ cửa hàng sang UTC). Chỉ ĐỌC. */
export async function loadWorkspaceTimeZone(workspaceId: string, userId: string): Promise<string> {
  return getDb().withActor(workspaceId, userId, (tx) => workspaceTimeZone(tx, workspaceId));
}

/**
 * Dữ liệu trang Lịch đăng (COMPOSER-CALENDAR-UI + POST-PUBLISHING): bài THẬT của một tuần (từ Facebook), bài đăng từ CommentFlow của tuần, bản nháp và kênh, trong MỘT giao dịch
 * `withActor` (RLS theo thành viên; bài đăng từ CommentFlow chỉ Owner thấy). `workspaceId`/`userId` lấy từ `requireAppUser`, không từ URL. Chỉ ĐỌC.
 */
export async function loadCalendar(
  workspaceId: string,
  userId: string,
  weekStart: string,
): Promise<CalendarData> {
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const timeZone = await workspaceTimeZone(tx, workspaceId);
    const [posts, publish, drafts, channels] = await Promise.all([
      listPostsForWeek(tx, workspaceId, weekStart, timeZone),
      listPublishPostsForWeek(tx, workspaceId, weekStart, timeZone),
      listPublishDrafts(tx, workspaceId),
      listChannels(tx, workspaceId),
    ]);
    return { posts, publish, drafts, channels, timeZone };
  });
}

/** Ảnh/video của một bài (để hộp thoại bài trên Lịch xem trước). Chỉ ĐỌC; RLS: chỉ Owner. */
export async function loadPublishMedia(
  workspaceId: string,
  userId: string,
  postId: string,
): Promise<MediaAssetRow[]> {
  return getDb().withActor(workspaceId, userId, (tx) =>
    listPublishPostMedia(tx, workspaceId, postId),
  );
}

/** Kết quả đăng hiện tại của một bài (chỉ ĐỌC; RLS: chỉ Owner thấy bài của workspace mình). Không thấy bài → `null`. */
export async function loadPublishOutcome(
  workspaceId: string,
  userId: string,
  postId: string,
): Promise<PublishOutcome | null> {
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const post = await getPublishPost(tx, workspaceId, postId);
    return post ? outcomeOf(post.targets) : null;
  });
}

/** Dữ liệu trang Biên tập bài viết: kênh thật của workspace, múi giờ và (nếu có `postId`) bài đang sửa. Chỉ ĐỌC. */
export async function loadComposer(
  workspaceId: string,
  userId: string,
  postId?: string,
): Promise<ComposerData> {
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const [timeZone, channels, post, products, selectedProductIds, media, aiNote] =
      await Promise.all([
        workspaceTimeZone(tx, workspaceId),
        listChannels(tx, workspaceId),
        postId ? getPublishPost(tx, workspaceId, postId) : Promise.resolve(null),
        listPickableProducts(tx, workspaceId),
        postId ? listPublishPostProductIds(tx, workspaceId, postId) : Promise.resolve([]),
        postId ? listPublishPostMedia(tx, workspaceId, postId) : Promise.resolve([]),
        postId ? getPublishPostNote(tx, workspaceId, postId) : Promise.resolve(null),
      ]);
    return { channels, timeZone, post, products, selectedProductIds, media, aiNote };
  });
}
