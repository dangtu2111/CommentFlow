import {
  CircleHelp,
  FlaskConical,
  Gauge,
  Library,
  ListChecks,
  type LucideIcon,
  Rocket,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { NavItemKey } from '../../lib/app-nav';
import { KB_SUBNAV_GROUPS } from '../../lib/kb-structure';

export type KbActive = NavItemKey;

/** Biểu tượng từng mục menu (cùng bộ lucide với thanh bên chính). */
export const KB_ICONS: Partial<Record<NavItemKey, LucideIcon>> = {
  kb: Library,
  productImport: Upload,
  kbGaps: CircleHelp,
  readiness: Gauge,
  tryAi: FlaskConical,
  kbTestset: ListChecks,
  kbPublish: Rocket,
};

/**
 * Khung trang Cơ sở kiến thức (design/stitch/knowledge-base.png): cột "Cấu trúc tri thức / Tinh chỉnh" bên trái
 * (mục đang chọn tô màu nút chính), nội dung bên phải. Chỉ điều hướng tới trang đã có (`kb-structure.ts`); trang con
 * giữ nguyên nội dung và quyền riêng của nó (Owner).
 */
export async function KbFrame({ active, children }: { active: KbActive; children: ReactNode }) {
  const [t, tn] = await Promise.all([getTranslations('kb'), getTranslations('shell.nav')]);
  const OverviewIcon = KB_ICONS.kb ?? Library;
  return (
    <div className="kb-layout">
      <nav className="kb-subnav" aria-label={t('navLabel')}>
        <Link
          href="/app/kb"
          className="kb-subnav-link"
          aria-current={active === 'kb' ? 'page' : undefined}
        >
          <OverviewIcon size={18} aria-hidden="true" />
          {t('overview')}
        </Link>
        {KB_SUBNAV_GROUPS.map((group) => (
          <div key={group.key} className="kb-subnav-group">
            <p className="kb-subnav-heading">{t(`groups.${group.key}`)}</p>
            <ul>
              {group.items.map((item) => {
                const Icon = KB_ICONS[item.key];
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="kb-subnav-link"
                      aria-current={active === item.key ? 'page' : undefined}
                    >
                      {Icon ? <Icon size={18} aria-hidden="true" /> : null}
                      {tn(item.key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="kb-content">{children}</div>
    </div>
  );
}
