import { Bell, CreditCard, Database, Link2, ShieldCheck, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  type SettingsCounts,
  type SettingsNavKey,
  type SettingsRole,
  settingsNavFor,
} from '../../lib/settings-nav';
import { Breadcrumb } from '../ui/page-header';
import { SplitLayout } from '../ui/split-layout';

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
      <Breadcrumb
        label={t('breadcrumb.label')}
        root={t('breadcrumb.root')}
        current={t(`nav.${active}`)}
      />
      <SplitLayout
        navLabel={t('nav.label')}
        navTitle={t('nav.title')}
        items={settingsNavFor(viewerRole).map((item) => {
          const Icon = ICONS[item.key];
          return {
            key: item.key,
            href: item.href,
            label: t(`nav.${item.key}`),
            icon: <Icon size={18} aria-hidden="true" />,
            count: note(item.key),
            current: item.key === active,
          };
        })}
      >
        {children}
      </SplitLayout>
    </div>
  );
}
