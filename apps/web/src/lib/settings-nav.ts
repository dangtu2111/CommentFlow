/**
 * Cột trái "CẤU HÌNH WORKSPACE" của trang Cài đặt (design/stitch/settings-security.png). Thuần, không phụ thuộc React/DB.
 * CHỈ liệt kê mục có trang thật (Thông báo, Dữ liệu & Quyền riêng tư, Gói & Thanh toán chưa có tính năng → không hiện,
 * Q-UISET2). Quyền xem trang vẫn do chính trang kiểm; lọc ở đây chỉ để không hiện liên kết vô ích.
 */
export type SettingsRole = 'owner' | 'staff';
export type SettingsNavKey = 'channels' | 'members' | 'security';
export type SettingsNavItem = { key: SettingsNavKey; href: string };
/** Số hiện cạnh mục ở cột trái: kênh đã kết nối/tổng, số thành viên. */
export type SettingsCounts = { channelsConnected: number; channelsTotal: number; members: number };

const ENTRIES: ReadonlyArray<SettingsNavItem & { owner: boolean }> = [
  { key: 'channels', href: '/app/channels', owner: true },
  { key: 'members', href: '/app/members', owner: true },
  { key: 'security', href: '/app/settings', owner: false },
];

export function settingsNavFor(role: SettingsRole): SettingsNavItem[] {
  return ENTRIES.filter((entry) => role === 'owner' || !entry.owner).map(({ key, href }) => ({
    key,
    href,
  }));
}
