'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavActive, type NavItemKey, type NavRole, sectionTabsFor } from '../../lib/app-nav';

/**
 * Thanh tab của trang cha (Bình luận ⟵ AI đã gửi; Cài đặt ⟵ Kênh, Thành viên). Tự ẩn khi trang hiện tại không thuộc
 * mục có tab. `labels` do Server Component truyền xuống (đã dịch); URL các trang không đổi.
 */
export function SectionTabs({
  role,
  labels,
  ariaLabel,
}: {
  role: NavRole;
  labels: Partial<Record<NavItemKey, string>>;
  ariaLabel: string;
}) {
  const pathname = usePathname();
  const tabs = sectionTabsFor(role, pathname);
  if (!tabs) return null;
  return (
    <nav className="section-tabs" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className="section-tab"
          aria-current={isNavActive(pathname, tab.href) ? 'page' : undefined}
        >
          {labels[tab.key] ?? tab.key}
        </Link>
      ))}
    </nav>
  );
}
