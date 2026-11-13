/**
 * Gom/đếm dữ liệu cho Lịch đăng (COMPOSER-CALENDAR-UI). THUẦN: nhận bài đã đổi sang ngày địa phương (`day` = `YYYY-MM-DD`) từ truy vấn `listPostsForWeek`.
 * Chỉ số liệu THẬT từ dữ liệu của tuần (không có mục tiêu/tăng trưởng/dự báo như bản thiết kế mẫu).
 */
import { COMPOSER_PLATFORMS, type ComposerPlatform } from './post-counters';

type DayPost = { day: string };
type PlatformPost = { platform: string };
type StatPost = { commentCount: number; pendingCount: number };

/** Mỗi ngày của tuần một mảng (kể cả rỗng), giữ thứ tự bài; bài ngoài danh sách ngày bị bỏ. */
export function groupByDay<T extends DayPost>(
  posts: readonly T[],
  days: readonly string[],
): Record<string, T[]> {
  const grouped: Record<string, T[]> = Object.fromEntries(days.map((day) => [day, [] as T[]]));
  for (const post of posts) grouped[post.day]?.push(post);
  return grouped;
}

export type PlatformCounts = { all: number } & Record<ComposerPlatform, number>;

export function platformCounts(posts: readonly PlatformPost[]): PlatformCounts {
  const counts: PlatformCounts = { all: posts.length, facebook: 0, instagram: 0, tiktok: 0 };
  for (const post of posts) {
    if ((COMPOSER_PLATFORMS as readonly string[]).includes(post.platform)) {
      counts[post.platform as ComposerPlatform] += 1;
    }
  }
  return counts;
}

export function weekTotals(posts: readonly StatPost[]): {
  posts: number;
  comments: number;
  pending: number;
} {
  return posts.reduce(
    (total, post) => ({
      posts: total.posts + 1,
      comments: total.comments + post.commentCount,
      pending: total.pending + post.pendingCount,
    }),
    { posts: 0, comments: 0, pending: 0 },
  );
}

/** Tham số `p` của URL: chỉ nền tảng hợp lệ mới lọc; còn lại bỏ qua. */
export function parsePlatformFilter(value: string | undefined): ComposerPlatform | undefined {
  return (COMPOSER_PLATFORMS as readonly string[]).includes(value ?? '')
    ? (value as ComposerPlatform)
    : undefined;
}
