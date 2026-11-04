'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavActive, type NavGroupKey, type NavItemKey } from '../../lib/app-nav';

type Group = {
  key: NavGroupKey;
  label: string;
  items: Array<{ key: NavItemKey; href: string; label: string }>;
};

/**
 * Thanh điều hướng của khung ứng dụng. Client Component chỉ để biết đường dẫn hiện tại (đánh dấu `aria-current`);
 * danh sách và nhãn do Server Component truyền xuống (đã lọc theo vai trò, đã dịch).
 */
export function ShellNav({ groups, label }: { groups: Group[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="shell-nav" aria-label={label}>
      {groups.map((group) => (
        <div key={group.key} className="shell-nav-group">
          <p className="shell-nav-heading">{group.label}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="shell-nav-link"
                  aria-current={isNavActive(pathname, item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
