import { describe, expect, it } from 'vitest';
import { buildPostsHref, parsePostsSearchParams, postsPageCount } from './posts-filters';

const UUID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';

describe('FR-060 tham số URL trang Bài viết', () => {
  it('FR-060 không tham số → mặc định (chờ nhiều nhất, trang 1, không lọc)', () => {
    expect(parsePostsSearchParams({})).toEqual({ sort: 'pending', page: 1 });
  });

  it('FR-060 đọc đủ bộ lọc hợp lệ', () => {
    expect(
      parsePostsSearchParams({
        platform: 'instagram',
        channel: UUID,
        kind: 'ads',
        q: '  váy  ',
        sort: 'newest',
        page: '3',
      }),
    ).toEqual({
      platform: 'instagram',
      channelId: UUID,
      kind: 'ads',
      search: 'váy',
      sort: 'newest',
      page: 3,
    });
  });

  it('FR-060 giá trị lạ bị bỏ qua, trang không hợp lệ về 1, tìm kiếm cắt 100 ký tự', () => {
    const view = parsePostsSearchParams({
      platform: 'myspace',
      channel: 'không-phải-uuid',
      kind: 'x',
      sort: 'z',
      page: '-4',
      q: 'a'.repeat(300),
    });
    expect(view).toEqual({ sort: 'pending', page: 1, search: 'a'.repeat(100) });
    expect(parsePostsSearchParams({ page: 'abc' }).page).toBe(1);
    expect(parsePostsSearchParams({ page: '999999999' }).page).toBe(1000);
  });

  it('FR-060 dựng URL bỏ giá trị mặc định; ghi đè đổi bộ lọc', () => {
    expect(buildPostsHref({ sort: 'pending', page: 1 })).toBe('/app/posts');
    expect(buildPostsHref({ sort: 'newest', page: 2, kind: 'ads' })).toBe(
      '/app/posts?kind=ads&sort=newest&page=2',
    );
    expect(buildPostsHref({ sort: 'pending', page: 3 }, { page: 1, platform: 'facebook' })).toBe(
      '/app/posts?platform=facebook',
    );
  });

  it('FR-060 số trang = làm tròn lên, tối thiểu 1', () => {
    expect(postsPageCount(0, 20)).toBe(1);
    expect(postsPageCount(20, 20)).toBe(1);
    expect(postsPageCount(21, 20)).toBe(2);
  });
});
