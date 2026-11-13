import { describe, expect, it } from 'vitest';
import { getMessages } from '../i18n/messages';
import {
  isNavActive,
  navGroupsFor,
  roleAccessRows,
  sectionTabsFor,
  splitNavByRole,
} from './app-nav';

describe('FR-040 trang 403: chia mục điều hướng theo vai trò (docs/08 §7.8)', () => {
  it('FR-040 Staff: "dùng được" khớp điều hướng của Staff; "chỉ Owner" là phần còn lại', () => {
    const split = splitNavByRole('staff');
    // "Dùng được" gồm cả trang con (AI đã gửi), nên so theo đường dẫn của mục chính + trang con.
    expect(split.allowed.map((i) => i.href).sort()).toEqual(
      navGroupsFor('staff')
        .flatMap((g) => g.items.flatMap((i) => i.matchHrefs))
        .sort(),
    );
    expect(split.ownerOnly.map((i) => i.key)).toContain('members');
    expect(split.ownerOnly.map((i) => i.key)).toContain('channels');
    expect(split.ownerOnly.some((i) => split.allowed.some((a) => a.key === i.key))).toBe(false);
  });

  it('FR-040 Owner: không có mục nào "chỉ Owner" bị khóa', () => {
    expect(splitNavByRole('owner').ownerOnly).toEqual([]);
  });
});

const keys = (role: 'owner' | 'staff') =>
  navGroupsFor(role).flatMap((group) => group.items.map((item) => item.key));

describe('FR-040 điều hướng khung ứng dụng (docs/08 §3)', () => {
  it('FR-040 Owner thấy Bình luận, Kênh, Thành viên, Nhật ký, Cài đặt; Staff không thấy Kênh/Thành viên (có Nhật ký của mình, FR-092) (trang chỉ Owner, docs/13 §3.1)', () => {
    expect(keys('owner')).toEqual([
      'comments',
      'posts',
      'leads',
      'reports',
      'composer',
      'calendar',
      'kb',
      'automation',
      'spamRules',
      'activity',
      'settings',
    ]);
    expect(keys('staff')).toEqual([
      'comments',
      'posts',
      'leads',
      'reports',
      'activity',
      'settings',
    ]);
  });

  it('FR-040 không hiện mục chưa có trang thật (Tin nhắn) và không hiện trang con ở thanh bên', () => {
    const hidden = ['messages', 'aiSent', 'tryAi', 'channels', 'members'];
    for (const role of ['owner', 'staff'] as const) {
      for (const key of hidden) expect(keys(role)).not.toContain(key);
    }
  });

  it('FR-001 FR-119 mục Cài đặt (bảo mật + ngôn ngữ) có cho mọi vai trò, trỏ /app/settings; không còn mục Bảo mật riêng', () => {
    for (const role of ['owner', 'staff'] as const) {
      const items = navGroupsFor(role).flatMap((g) => g.items);
      expect(items.find((i) => i.key === 'settings')?.href).toBe('/app/settings');
      expect(items.map((i) => i.key)).not.toContain('security');
    }
  });

  it('FR-119 mọi mục menu có nhãn shell.nav.<khóa> ở cả vi và en', () => {
    for (const locale of ['vi', 'en'] as const) {
      const nav = getMessages(locale).shell.nav as Record<string, string>;
      for (const role of ['owner', 'staff'] as const) {
        for (const item of navGroupsFor(role).flatMap((g) => g.items)) {
          expect(nav[item.key], `${locale}:${item.key}`).toBeTruthy();
        }
      }
    }
  });

  it('FR-040 "Rời workspace" không phải mục menu chính (nằm ở bộ chuyển workspace, trang /app/leave)', () => {
    for (const role of ['owner', 'staff'] as const) {
      expect(keys(role)).not.toContain('leave');
    }
  });

  it('FR-040 chia nhóm: vận hành (Bình luận), biên tập & lịch đăng (chỉ Owner) và hệ thống; không nhóm rỗng; href thuộc /app/ và không trùng', () => {
    for (const role of ['owner', 'staff'] as const) {
      const groups = navGroupsFor(role);
      expect(groups.map((g) => g.key)).toEqual(
        role === 'owner' ? ['operations', 'publishing', 'system'] : ['operations', 'system'],
      );
      for (const group of groups) expect(group.items.length).toBeGreaterThan(0);
      const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const href of hrefs) expect(href.startsWith('/app/')).toBe(true);
    }
  });
});

describe('FR-040 trang con gom vào trang cha', () => {
  const item = (role: 'owner' | 'staff', key: string) =>
    navGroupsFor(role)
      .flatMap((g) => g.items)
      .find((i) => i.key === key);

  it('FR-040 mục cha có đường dẫn của mọi trang con (đánh dấu "đang mở", URL giữ nguyên)', () => {
    const subs = ['/app/try-ai', '/app/readiness', '/app/kb-gaps', '/app/kb-publish'];
    subs.push('/app/kb-testset', '/app/products/import');
    for (const sub of subs) expect(item('owner', 'kb')?.matchHrefs, sub).toContain(sub);
    expect(item('owner', 'settings')?.matchHrefs).toEqual(
      expect.arrayContaining(['/app/settings', '/app/channels', '/app/members']),
    );
    expect(item('owner', 'comments')?.matchHrefs).toContain('/app/ai-sent');
    expect(item('owner', 'posts')?.matchHrefs).toEqual(['/app/posts']);
  });

  it('FR-040 thanh tab: Bình luận ⟵ AI đã gửi; Cài đặt dùng cột trái (SettingsFrame) nên không có tab; trang khác không có tab', () => {
    const tabKeys = (role: 'owner' | 'staff', path: string) =>
      sectionTabsFor(role, path)?.map((t) => t.key);
    expect(tabKeys('owner', '/app/ai-sent')).toEqual(['comments', 'aiSent']);
    expect(tabKeys('owner', '/app/channels')).toBeUndefined();
    expect(tabKeys('staff', '/app/ai-sent')).toEqual(['comments', 'aiSent']);
    expect(sectionTabsFor('staff', '/app/settings')).toBeNull();
    expect(sectionTabsFor('owner', '/app/posts')).toBeNull();
    expect(sectionTabsFor('owner', '/app/kb-gaps')).toBeNull(); // KB có khung riêng (KbFrame)
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

describe('GĐ0-TENANCY bảng quyền theo vai trò lấy từ bảng quyền thật (ENTRIES)', () => {
  it('mỗi hàng khớp navGroupsFor/splitNavByRole; Owner có mọi mục; Thành viên chỉ Owner', () => {
    const rows = roleAccessRows();
    const staffKeys = splitNavByRole('staff').allowed.map((i) => i.key);
    const ownerKeys = splitNavByRole('owner').allowed.map((i) => i.key);
    expect(rows.filter((r) => r.staff).map((r) => r.key)).toEqual(staffKeys);
    expect(rows.filter((r) => r.owner).map((r) => r.key)).toEqual(ownerKeys);
    expect(rows.every((r) => r.owner)).toBe(true);
    const members = rows.find((r) => r.key === 'members');
    expect(members).toMatchObject({ owner: true, staff: false });
    expect(rows.find((r) => r.key === 'comments')).toMatchObject({ owner: true, staff: true });
  });
});

describe('COMPOSER-CALENDAR-UI nhóm điều hướng "Biên tập & lịch đăng"', () => {
  it('Owner có nhóm thứ ba giữa "vận hành" và "hệ thống" với hai trang thật; Staff không có nhóm này', () => {
    expect(navGroupsFor('owner').map((g) => g.key)).toEqual(['operations', 'publishing', 'system']);
    const publishing = navGroupsFor('owner').find((g) => g.key === 'publishing');
    expect(publishing?.items.map((i) => [i.key, i.href])).toEqual([
      ['composer', '/app/composer'],
      ['calendar', '/app/calendar'],
    ]);
    expect(navGroupsFor('staff').map((g) => g.key)).toEqual(['operations', 'system']);
  });

  it('đang ở trang con của composer/calendar thì mục đó sáng; mục khác thì không', () => {
    expect(isNavActive('/app/composer', '/app/composer')).toBe(true);
    expect(isNavActive('/app/calendar', '/app/composer')).toBe(false);
  });

  it('nhóm và mục mới đều có chữ ở vi và en (không rơi về khóa trống)', () => {
    for (const locale of ['vi', 'en'] as const) {
      const shell = (
        getMessages(locale) as {
          shell: { groups: Record<string, string>; nav: Record<string, string> };
        }
      ).shell;
      expect(shell.groups.publishing, locale).toBeTruthy();
      expect(shell.nav.composer, locale).toBeTruthy();
      expect(shell.nav.calendar, locale).toBeTruthy();
    }
  });
});
