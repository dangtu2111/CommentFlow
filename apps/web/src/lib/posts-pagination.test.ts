import { describe, expect, it } from 'vitest';
import { postsPageWindow } from './posts-pagination';

describe('FR-060 phân trang theo số (design/stitch/posts.png)', () => {
  it('FR-060 ít trang: liệt kê hết', () => {
    expect(postsPageWindow(1, 3)).toEqual([1, 2, 3]);
  });
  it('FR-060 nhiều trang, đang ở đầu: 1 2 3 … cuối', () => {
    expect(postsPageWindow(1, 12)).toEqual([1, 2, 3, 'gap', 12]);
  });
  it('FR-060 ở giữa: đầu … trước, hiện, sau … cuối', () => {
    expect(postsPageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
  });
  it('FR-060 ở cuối: 1 … cuối-2 cuối-1 cuối', () => {
    expect(postsPageWindow(12, 12)).toEqual([1, 'gap', 10, 11, 12]);
  });
  it('FR-060 một trang hoặc không có: một số 1; trang ngoài khoảng được kẹp lại', () => {
    expect(postsPageWindow(1, 1)).toEqual([1]);
    expect(postsPageWindow(1, 0)).toEqual([1]);
    expect(postsPageWindow(99, 5)).toEqual([1, 'gap', 3, 4, 5]);
  });
});
