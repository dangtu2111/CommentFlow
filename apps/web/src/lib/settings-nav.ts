/**
 * Cột trái "CẤU HÌNH WORKSPACE" của trang Cài đặt (design/stitch/settings-security.png). Thuần, không phụ thuộc React/DB.
 * CHỈ liệt kê mục có trang thật. Gói & Thanh toán, Thông báo, Dữ liệu & Quyền riêng tư là trang giao diện (UI-first,
 * Q-USP1): phần chưa có chức năng ghi rõ "Sắp có". Quyền xem trang vẫn do chính trang kiểm; lọc ở đây chỉ để không hiện liên kết vô ích.
 */
export type SettingsRole = 'owner' | 'staff';
export type SettingsNavKey =
  | 'channels'
  | 'members'
  | 'billing'
  | 'notifications'
  | 'privacy'
  | 'security';
export type SettingsNavItem = { key: SettingsNavKey; href: string };
/** Số hiện cạnh mục ở cột trái: kênh đã kết nối/tổng, số thành viên. */
export type SettingsCounts = { channelsConnected: number; channelsTotal: number; members: number };

const ENTRIES: ReadonlyArray<SettingsNavItem & { owner: boolean }> = [
  { key: 'channels', href: '/app/channels', owner: true },
  { key: 'members', href: '/app/members', owner: true },
  { key: 'billing', href: '/app/settings/billing', owner: true },
  { key: 'notifications', href: '/app/settings/notifications', owner: false },
  { key: 'privacy', href: '/app/settings/privacy', owner: true },
  { key: 'security', href: '/app/settings', owner: false },
];

export function settingsNavFor(role: SettingsRole): SettingsNavItem[] {
  return ENTRIES.filter((entry) => role === 'owner' || !entry.owner).map(({ key, href }) => ({
    key,
    href,
  }));
}
