import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Bài của MỘT tuần cho Lịch đăng (COMPOSER-CALENDAR-UI). Ngày/giờ đổi sang MÚI GIỜ WORKSPACE ngay ở DB (`AT TIME ZONE`), nên không phụ thuộc múi giờ máy chủ.
 * Tuần là nửa mở [thứ Hai 00:00, thứ Hai sau 00:00) theo giờ địa phương. Bài chưa có `created_time` (chưa hydrate) bị bỏ vì không đặt được vào ngày nào.
 * Chỉ ĐỌC; RLS theo thành viên workspace (nơi gọi dùng `withActor`). Tối đa `MAX_CALENDAR_POSTS` bài mỗi tuần.
 */
export const MAX_CALENDAR_POSTS = 300;

export type CalendarPost = {
  id: string;
  channelId: string;
  channelName: string;
  platform: string;
  externalId: string;
  message: string | null;
  permalink: string | null;
  mediaUrl: string | null;
  isAd: boolean;
  createdTime: Date;
  /** Ngày địa phương `YYYY-MM-DD`. */
  day: string;
  /** Giờ địa phương `HH:MM`. */
  time: string;
  commentCount: number;
  pendingCount: number;
};

type Row = {
  id: string;
  channel_id: string;
  channel_name: string;
  platform: string;
  external_id: string;
  message: string | null;
  permalink: string | null;
  media_url: string | null;
  is_ad: boolean;
  created_time: Date;
  day: string;
  hhmm: string;
  comment_count: number;
  pending_count: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Tên múi giờ IANA: chữ, số, `/`, `_`, `+`, `-` (chặn ký tự lạ trước khi vào truy vấn). */
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

export async function listPostsForWeek(
  tx: Database,
  workspaceId: string,
  weekStart: string,
  timeZone: string,
): Promise<CalendarPost[]> {
  if (!ISO_DATE.test(weekStart)) throw new Error('invalid_week_start');
  if (!TIME_ZONE.test(timeZone)) throw new Error('invalid_time_zone');
  const result = await tx.execute<Row>(sql`
    SELECT p.id, p.channel_id, ch.name AS channel_name, ch.platform, p.external_id, p.message, p.permalink,
           p.media_url, p.is_ad, p.created_time, p.comment_count, p.pending_count,
           to_char(p.created_time AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
           to_char(p.created_time AT TIME ZONE ${timeZone}, 'HH24:MI') AS hhmm
      FROM cf.posts p
      JOIN cf.channels ch ON ch.id = p.channel_id AND ch.workspace_id = p.workspace_id
     WHERE p.workspace_id = ${workspaceId}::uuid
       AND p.created_time IS NOT NULL
       AND (p.created_time AT TIME ZONE ${timeZone}) >= ${weekStart}::date::timestamp
       AND (p.created_time AT TIME ZONE ${timeZone}) < (${weekStart}::date + 7)::timestamp
     ORDER BY p.created_time ASC, p.id ASC
     LIMIT ${MAX_CALENDAR_POSTS}`);
  return result.rows.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    platform: row.platform,
    externalId: row.external_id,
    message: row.message,
    permalink: row.permalink,
    mediaUrl: row.media_url,
    isAd: row.is_ad,
    createdTime: row.created_time,
    day: row.day,
    time: row.hhmm,
    commentCount: row.comment_count,
    pendingCount: row.pending_count,
  }));
}
