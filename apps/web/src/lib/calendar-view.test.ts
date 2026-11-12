import { describe, expect, it } from 'vitest';
import { groupByDay, parsePlatformFilter, platformCounts, weekTotals } from './calendar-view';

const post = (id: string, day: string, platform = 'facebook', comments = 0, pending = 0) => ({
  id,
  day,
  platform,
  commentCount: comments,
  pendingCount: pending,
});

describe('groupByDay', () => {
  it('mỗi ngày của tuần có một mảng (kể cả rỗng); giữ thứ tự bài; bỏ bài ngoài tuần', () => {
    const days = ['2026-11-09', '2026-11-10', '2026-11-11'];
    const grouped = groupByDay(
      [
        post('a', '2026-11-09'),
        post('b', '2026-11-11'),
        post('c', '2026-11-09'),
        post('x', '2026-12-01'),
      ],
      days,
    );
    expect(Object.keys(grouped)).toEqual(days);
    expect(grouped['2026-11-09']?.map((p) => p.id)).toEqual(['a', 'c']);
    expect(grouped['2026-11-10']).toEqual([]);
    expect(grouped['2026-11-11']?.map((p) => p.id)).toEqual(['b']);
  });
});

describe('platformCounts / weekTotals', () => {
  const posts = [
    post('1', 'd', 'facebook', 5, 2),
    post('2', 'd', 'facebook', 1, 0),
    post('3', 'd', 'instagram', 3, 3),
  ];
  it('đếm theo nền tảng kèm tổng; nền tảng không có → 0', () => {
    expect(platformCounts(posts)).toEqual({ all: 3, facebook: 2, instagram: 1, tiktok: 0 });
    expect(platformCounts([])).toEqual({ all: 0, facebook: 0, instagram: 0, tiktok: 0 });
  });

  it('tổng số bài, bình luận và bình luận chờ của tuần', () => {
    expect(weekTotals(posts)).toEqual({ posts: 3, comments: 9, pending: 5 });
    expect(weekTotals([])).toEqual({ posts: 0, comments: 0, pending: 0 });
  });
});

describe('parsePlatformFilter', () => {
  it('chỉ nhận facebook/instagram/tiktok; còn lại → undefined (không lọc)', () => {
    expect(parsePlatformFilter('facebook')).toBe('facebook');
    expect(parsePlatformFilter('tiktok')).toBe('tiktok');
    for (const bad of [undefined, '', 'all', 'youtube', "facebook'; DROP"]) {
      expect(parsePlatformFilter(bad), String(bad)).toBeUndefined();
    }
  });
});
