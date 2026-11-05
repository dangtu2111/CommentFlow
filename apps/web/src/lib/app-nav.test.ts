import { describe, expect, it } from 'vitest';
import { isNavActive, navGroupsFor } from './app-nav';

const keys = (role: 'owner' | 'staff') =>
  navGroupsFor(role).flatMap((group) => group.items.map((item) => item.key));

describe('FR-040 điều hướng khung ứng dụng (docs/08 §3)', () => {
  it('FR-040 Owner thấy Bình luận, Thành viên, Nhật ký, Bảo mật; Staff không thấy Thành viên (có Nhật ký của mình, FR-092) (trang chỉ Owner, docs/13 §3.1)', () => {
    expect(keys('owner')).toEqual(['comments', 'members', 'activity', 'security']);
    expect(keys('staff')).toEqual(['comments', 'activity', 'security']);
  });

  it('FR-040 chia nhóm: vận hành (Bình luận) và cài đặt; không nhóm rỗng; href thuộc /app/ và không trùng', () => {
    for (const role of ['owner', 'staff'] as const) {
      const groups = navGroupsFor(role);
      expect(groups.map((g) => g.key)).toEqual(['operations', 'settings']);
      for (const group of groups) expect(group.items.length).toBeGreaterThan(0);
      const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const href of hrefs) expect(href.startsWith('/app/')).toBe(true);
    }
  });
});

describe('FR-040 isNavActive', () => {
  it('FR-040 khớp đúng đường dẫn và trang con; bỏ query/hash; không khớp tiền tố giả', () => {
    const cases: Array<[string, string, boolean]> = [
      ['/app/comments', '/app/comments', true],
      ['/app/comments/', '/app/comments', true],
      ['/app/comments/abc', '/app/comments', true],
      ['/app/comments?tab=all', '/app/comments', true],
      ['/app/comments#x', '/app/comments', true],
      ['/app/commentsX', '/app/comments', false],
      ['/app/members', '/app/comments', false],
      ['/app', '/app/comments', false],
      ['/', '/app/comments', false],
    ];
    for (const [pathname, href, expected] of cases) {
      expect(isNavActive(pathname, href), `${pathname} ~ ${href}`).toBe(expected);
    }
  });
});
