import { Bell, CreditCard, Database, Link2, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  type SettingsCounts,
  type SettingsNavKey,
  type SettingsRole,
  settingsNavFor,
} from '../../lib/settings-nav';

const ICONS = {
  channels: Link2,
  members: Users,
  billing: CreditCard,
  notifications: Bell,
  privacy: Database,
  security: ShieldCheck,
} as const;

/**
 * Khung trang Cài đặt (design/stitch/settings-security.png): đường dẫn + cột trái "CẤU HÌNH WORKSPACE" + nội dung.
 * Dùng chung cho Tài khoản & Bảo mật, Kênh và Thành viên (mỗi trang tự đặt tiêu đề trong `children`).
 */
export async function SettingsFrame({
  viewerRole,
  active,
  counts,
  children,
}: {
  viewerRole: SettingsRole;
  active: SettingsNavKey;
  counts: SettingsCounts | null;
  children: ReactNode;
}) {
  const t = await getTranslations('settings');
  const note = (key: SettingsNavKey): string | null => {
    if (!counts) return null;
    if (key === 'channels')
      return t('nav.channelsCount', {
        connected: counts.channelsConnected,
        total: counts.channelsTotal,
      });
    if (key === 'members') return t('nav.membersCount', { count: counts.members });
    return null;
  };
  return (
    <div className="settings-frame">
      <nav className="breadcrumb" aria-label={t('breadcrumb.label')}>
        <span>{t('breadcrumb.root')}</span>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{t(`nav.${active}`)}</span>
      </nav>
      <div className="settings-layout">
        <nav className="settings-subnav" aria-label={t('nav.label')}>
          <p className="settings-subnav-title">{t('nav.title')}</p>
          <ul>
            {settingsNavFor(viewerRole).map((item) => {
              const Icon = ICONS[item.key];
              const count = note(item.key);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="settings-subnav-link"
                    aria-current={item.key === active ? 'page' : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{t(`nav.${item.key}`)}</span>
                    {count ? <span className="settings-subnav-count">{count}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="settings-content">{children}</div>
      </div>
    </div>
  );
}
