'use client';

import {
  BookOpen,
  Bot,
  CircleHelp,
  FileText,
  FlaskConical,
  Gauge,
  History,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  Plug,
  Settings,
  ShieldAlert,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isNavActive, type NavGroupKey, type NavItemKey } from '../../lib/app-nav';

type Group = {
  key: NavGroupKey;
  label: string;
  items: Array<{ key: NavItemKey; href: string; label: string }>;
};

const ICONS: Record<NavItemKey, LucideIcon> = {
  comments: MessageSquareText,
  posts: FileText,
  aiSent: Bot,
  tryAi: FlaskConical,
  readiness: Gauge,
  automation: Zap,
  productImport: Upload,
  kbGaps: CircleHelp,
  kbPublish: BookOpen,
  kbTestset: ListChecks,
  spamRules: ShieldAlert,
  channels: Plug,
  members: Users,
  activity: History,
  settings: Settings,
};

/**
 * Thanh bên của khung ứng dụng (design/stitch/comments.png). Client Component chỉ để biết đường dẫn hiện tại (đánh dấu
 * `aria-current`); danh sách và nhãn do Server Component truyền xuống (đã lọc theo vai trò, đã dịch). `footer` là thẻ
 * người dùng ở đáy thanh bên (Server Component truyền vào).
 */
export function ShellNav({
  groups,
  label,
  footer,
}: {
  groups: Group[];
  label: string;
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <nav className="shell-nav" aria-label={label}>
      <div className="shell-nav-groups">
        {groups.map((group) => (
          <div key={group.key} className="shell-nav-group">
            <p className="shell-nav-heading">{group.label}</p>
            <ul>
              {group.items.map((item) => {
                const Icon = ICONS[item.key];
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="shell-nav-link"
                      aria-current={isNavActive(pathname, item.href) ? 'page' : undefined}
                    >
                      <Icon size={18} aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer}
    </nav>
  );
}
