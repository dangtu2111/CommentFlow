import Link from 'next/link';
import type { ReactNode } from 'react';

export type SubNavItem = {
  key: string;
  href: string;
  label: string;
  icon: ReactNode;
  /** Ghi chú ngắn bên phải (ví dụ "2/3"). */
  count?: string | null;
  current: boolean;
};

/**
 * Bố cục hai cột: cột con (điều hướng) + nội dung. Dưới 900px cột con thành hàng cuộn ngang phía trên.
 * Dùng cho Cài đặt; trang chỉ truyền dữ liệu điều hướng và nội dung.
 */
export function SplitLayout({
  navLabel,
  navTitle,
  items,
  header,
  children,
}: {
  navLabel: string;
  navTitle: string;
  items: readonly SubNavItem[];
  /** Đầu trang (PageHeader), trải hết bề ngang phía trên cả cột con lẫn nội dung. */
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-layout">
      {header}
      <div className="settings-body">
        <nav className="settings-subnav" aria-label={navLabel}>
          <p className="settings-subnav-title">{navTitle}</p>
          <ul>
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="settings-subnav-link"
                  aria-current={item.current ? 'page' : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.count ? <span className="settings-subnav-count">{item.count}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-content">{children}</div>
      </div>
    </div>
  );
}
