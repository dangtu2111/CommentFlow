/**
 * Điều hướng của khung ứng dụng (docs/08 §3). Thuần, không phụ thuộc React/DB để test được và dùng được ở cả
 * Server Component (lọc theo vai trò) lẫn Client Component (đánh dấu mục đang mở).
 *
 * CHỈ liệt kê trang ĐÃ TỒN TẠI (không tạo liên kết chết); mục mới thêm khi tính năng tương ứng ra đời.
 * Quyền xem trang vẫn do chính trang kiểm (`requireAppUser`); lọc ở đây chỉ để không hiện liên kết vô ích.
 */
export type NavRole = 'owner' | 'staff';
export type NavGroupKey = 'operations' | 'settings';
export type NavItemKey = 'comments' | 'members' | 'activity' | 'security';

export type NavItem = { key: NavItemKey; href: string };
export type NavGroup = { key: NavGroupKey; items: NavItem[] };

type Entry = NavItem & { group: NavGroupKey; roles: readonly NavRole[] };

const ENTRIES: readonly Entry[] = [
  { key: 'comments', href: '/app/comments', group: 'operations', roles: ['owner', 'staff'] },
  // Trang Thành viên chỉ Owner (docs/13 §3.1); Staff nhận 404 nên không hiện liên kết.
  { key: 'members', href: '/app/members', group: 'settings', roles: ['owner'] },
  // Nhật ký (FR-092): Owner thấy tất cả, Staff chỉ dòng của mình (lọc ở truy vấn `listActionLogs`).
  { key: 'activity', href: '/app/activity', group: 'settings', roles: ['owner', 'staff'] },
  { key: 'security', href: '/app/security', group: 'settings', roles: ['owner', 'staff'] },
];

const GROUP_ORDER: readonly NavGroupKey[] = ['operations', 'settings'];

export function navGroupsFor(role: NavRole): NavGroup[] {
  return GROUP_ORDER.map((group) => ({
    key: group,
    items: ENTRIES.filter((e) => e.group === group && e.roles.includes(role)).map(
      ({ key, href }) => ({ key, href }),
    ),
  })).filter((group) => group.items.length > 0);
}

/** Mục đang mở: đúng đường dẫn hoặc trang con (bỏ query/hash, dấu `/` cuối); không khớp tiền tố giả. */
export function isNavActive(pathname: string, href: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, '') ?? '';
  return path === href || path.startsWith(`${href}/`);
}
