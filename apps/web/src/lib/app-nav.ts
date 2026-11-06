/**
 * Điều hướng của khung ứng dụng (docs/08 §3). Thuần, không phụ thuộc React/DB để test được và dùng được ở cả
 * Server Component (lọc theo vai trò) lẫn Client Component (đánh dấu mục đang mở).
 *
 * CHỈ liệt kê trang ĐÃ TỒN TẠI (không tạo liên kết chết); mục mới thêm khi tính năng tương ứng ra đời.
 * Quyền xem trang vẫn do chính trang kiểm (`requireAppUser`); lọc ở đây chỉ để không hiện liên kết vô ích.
 */
export type NavRole = 'owner' | 'staff';
export type NavGroupKey = 'operations' | 'settings';
export type NavItemKey =
  | 'comments'
  | 'posts'
  | 'tryAi'
  | 'readiness'
  | 'productImport'
  | 'kbGaps'
  | 'kbPublish'
  | 'spamRules'
  | 'channels'
  | 'members'
  | 'activity'
  | 'settings';

export type NavItem = { key: NavItemKey; href: string };
export type NavGroup = { key: NavGroupKey; items: NavItem[] };

type Entry = NavItem & { group: NavGroupKey; roles: readonly NavRole[] };

const ENTRIES: readonly Entry[] = [
  { key: 'comments', href: '/app/comments', group: 'operations', roles: ['owner', 'staff'] },
  // Bài viết (FR-060): xem được với mọi vai trò (RLS theo thành viên workspace).
  { key: 'posts', href: '/app/posts', group: 'operations', roles: ['owner', 'staff'] },
  // Trang Kênh (kết nối Facebook, FR-010) chỉ Owner; Staff nhận 404 nên không hiện liên kết.
  // Thử AI (FR-059, US-034): Owner thử trước khi bật tự gửi; không trừ lượt, chạy bằng mock.
  { key: 'tryAi', href: '/app/try-ai', group: 'settings', roles: ['owner'] },
  // Độ sẵn sàng của AI (FR-146, US-107): Owner xem thiếu gì trước khi bật Tự động.
  { key: 'readiness', href: '/app/readiness', group: 'settings', roles: ['owner'] },
  // Nhập sản phẩm Excel/CSV (FR-051, US-003): chỉ Owner; Staff nhận 404.
  { key: 'productImport', href: '/app/products/import', group: 'settings', roles: ['owner'] },
  // Câu hỏi AI chưa trả lời được (FR-134, UF-11): Owner bổ sung kiến thức nhanh.
  { key: 'kbGaps', href: '/app/kb-gaps', group: 'settings', roles: ['owner'] },
  // Phiên bản kiến thức (FR-054, UF-8): Owner xuất bản/khôi phục.
  { key: 'kbPublish', href: '/app/kb-publish', group: 'settings', roles: ['owner'] },
  // Quy tắc spam (FR-080, US-050): Owner tạo quy tắc + xem trước 7 ngày.
  { key: 'spamRules', href: '/app/spam-rules', group: 'settings', roles: ['owner'] },
  { key: 'channels', href: '/app/channels', group: 'settings', roles: ['owner'] },
  // Trang Thành viên chỉ Owner (docs/13 §3.1); Staff nhận 404 nên không hiện liên kết.
  { key: 'members', href: '/app/members', group: 'settings', roles: ['owner'] },
  // Nhật ký (FR-092): Owner thấy tất cả, Staff chỉ dòng của mình (lọc ở truy vấn `listActionLogs`).
  { key: 'activity', href: '/app/activity', group: 'settings', roles: ['owner', 'staff'] },
  // Cài đặt (FR-001, FR-119): bảo mật (2FA, phiên) + ngôn ngữ. `/app/security` chỉ còn là trang bắt buộc bật 2FA ngoài khung.
  { key: 'settings', href: '/app/settings', group: 'settings', roles: ['owner', 'staff'] },
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
