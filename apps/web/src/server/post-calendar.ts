import {
  type CalendarPost,
  type ChannelListItem,
  eq,
  listChannels,
  listPostsForWeek,
  schema,
} from '@flow/db/runtime';
import { isValidTimezone } from '@flow/shared';
import { getDb } from './db';

export type CalendarData = { posts: CalendarPost[]; channels: ChannelListItem[]; timeZone: string };
export type ComposerData = { channels: ChannelListItem[]; timeZone: string };

const FALLBACK_TIME_ZONE = 'UTC';

async function workspaceTimeZone(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['withActor']>[2]>[0],
  workspaceId: string,
): Promise<string> {
  const rows = await tx
    .select({ timezone: schema.workspaces.timezone })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  const zone = rows[0]?.timezone;
  return zone && isValidTimezone(zone) ? zone : FALLBACK_TIME_ZONE;
}

/**
 * Dữ liệu trang Lịch đăng (COMPOSER-CALENDAR-UI): bài THẬT của một tuần + kênh, trong MỘT giao dịch `withActor` (RLS theo thành viên). `workspaceId`/`userId`
 * lấy từ `requireAppUser`, không từ URL. Chỉ ĐỌC.
 */
export async function loadCalendar(
  workspaceId: string,
  userId: string,
  weekStart: string,
): Promise<CalendarData> {
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const timeZone = await workspaceTimeZone(tx, workspaceId);
    const [posts, channels] = await Promise.all([
      listPostsForWeek(tx, workspaceId, weekStart, timeZone),
      listChannels(tx, workspaceId),
    ]);
    return { posts, channels, timeZone };
  });
}

/** Dữ liệu trang Biên tập bài viết: kênh thật đã kết nối của workspace + múi giờ (để hiện giờ đăng). Chỉ ĐỌC. */
export async function loadComposer(workspaceId: string, userId: string): Promise<ComposerData> {
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const [timeZone, channels] = await Promise.all([
      workspaceTimeZone(tx, workspaceId),
      listChannels(tx, workspaceId),
    ]);
    return { channels, timeZone };
  });
}
