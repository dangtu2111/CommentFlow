import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { NavItemKey } from '../../lib/app-nav';
import { KB_SUBNAV_GROUPS } from '../../lib/kb-structure';

export type KbActive = NavItemKey;

/**
 * Khung trang Cơ sở kiến thức (design/stitch/knowledge-base.png): cột "Cấu trúc tri thức / Tinh chỉnh" bên trái,
 * nội dung bên phải. Chỉ điều hướng tới trang đã có (`kb-structure.ts`); trang con giữ nguyên nội dung và quyền
 * riêng của nó (Owner).
 */
export async function KbFrame({ active, children }: { active: KbActive; children: ReactNode }) {
  const [t, tn] = await Promise.all([getTranslations('kb'), getTranslations('shell.nav')]);
  return (
    <div className="kb-layout">
      <nav className="kb-subnav" aria-label={t('navLabel')}>
        <Link
          href="/app/kb"
          className="kb-subnav-link"
          aria-current={active === 'kb' ? 'page' : undefined}
        >
          {t('overview')}
        </Link>
        {KB_SUBNAV_GROUPS.map((group) => (
          <div key={group.key} className="kb-subnav-group">
            <p className="kb-subnav-heading">{t(`groups.${group.key}`)}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="kb-subnav-link"
                    aria-current={active === item.key ? 'page' : undefined}
                  >
                    {tn(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="kb-content">{children}</div>
    </div>
  );
}
