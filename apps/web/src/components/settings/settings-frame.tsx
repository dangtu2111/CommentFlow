import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import {
  type SettingsCounts,
  type SettingsNavKey,
  type SettingsRole,
  settingsNavFor,
} from '../../lib/settings-nav';
import { Icon, type IconName } from '../ui/icon';

const ICONS: Record<SettingsNavKey, IconName> = {
  channels: 'hub',
  members: 'group',
  billing: 'credit_card',
  notifications: 'notifications_active',
  privacy: 'policy',
  security: 'shield_person',
};

/** Phần khung do trang cha cung cấp (vai trò + số đếm cột trái); view tự đặt `active` và `header`. */
export type SettingsFrameScope = { viewerRole: SettingsRole; counts: SettingsCounts | null };

/** Đầu trang Tailwind theo Stitch: tiêu đề + mô tả bên trái, khe bên phải (chip trạng thái…). */
export function TwPageHeader({
  title,
  subtitle,
  end,
  size = 'lg',
}: {
  title: string;
  subtitle?: string;
  end?: ReactNode;
  size?: 'lg' | 'md';
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div>
        <h1
          className={cn(
            'text-on-surface tracking-tight',
            size === 'lg'
              ? 'font-headline-lg text-headline-lg'
              : 'font-headline-md text-headline-md',
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-0.5">{subtitle}</p>
        ) : null}
      </div>
      {end ? <div className="flex items-center gap-space-sm">{end}</div> : null}
    </div>
  );
}

/**
 * Khung trang Cài đặt dựng bằng Tailwind (design/stitch/settings-security.html, settings-billing.html):
 * đường dẫn + đầu trang + (cột trái `sidebar` 3/12 | thanh tab `tabs`) + nội dung. Khoảng cách MỘT biến `gap-gutter` (16px).
 * Dùng chung cho Tài khoản & Bảo mật, Kênh, Thành viên, Gói, Thông báo, Quyền riêng tư.
 */
export async function SettingsFrame({
  viewerRole,
  active,
  counts,
  header,
  variant = 'sidebar',
  sideNote,
  children,
}: {
  viewerRole: SettingsRole;
  active: SettingsNavKey;
  counts: SettingsCounts | null;
  /** Đầu trang của trang con; nằm trên cả cột trái lẫn nội dung. */
  header: ReactNode;
  /** `sidebar`: cột trái (Bảo mật, Kênh…); `tabs`: thanh tab ngang (Thành viên, Gói — như Stitch). */
  variant?: 'sidebar' | 'tabs';
  /** Hộp ghi chú dưới cột trái (chỉ ở `sidebar`). */
  sideNote?: ReactNode;
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
  const items = settingsNavFor(viewerRole);
  const tabs = variant === 'tabs';
  return (
    <div className="tw settings-frame-tw p-gutter flex flex-col gap-gutter">
      <nav
        aria-label={t('breadcrumb.label')}
        className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md"
      >
        <span>{t('breadcrumb.root')}</span>
        <Icon name="chevron_right" size={12} />
        <span aria-current="page" className="text-primary font-medium">
          {t(`nav.${active}`)}
        </span>
      </nav>
      {header}
      <div
        className={
          tabs ? 'flex flex-col gap-gutter' : 'grid grid-cols-1 xl:grid-cols-12 gap-gutter'
        }
      >
        <div
          className={cn(
            tabs
              ? 'bg-surface-container-lowest rounded-xl p-1.5 shadow-sm overflow-x-auto'
              : 'xl:col-span-3 xl:self-start xl:sticky xl:top-20 space-y-space-md',
          )}
        >
          <nav aria-label={t('nav.label')}>
            <ul
              className={cn(
                tabs
                  ? 'flex items-center gap-1 min-w-max'
                  : 'bg-surface-container-lowest rounded-xl p-space-sm shadow-sm space-y-1',
              )}
            >
              {tabs ? null : (
                <li className="px-3 py-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                  {t('nav.title')}
                </li>
              )}
              {items.map((item) => {
                const current = item.key === active;
                const count = note(item.key);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between rounded-lg transition-colors',
                        tabs ? 'gap-2 px-3.5 py-2' : 'px-3 py-2.5',
                        current
                          ? 'bg-primary-container text-on-primary shadow-sm'
                          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                      )}
                    >
                      <span className={cn('flex items-center', tabs ? 'gap-2' : 'gap-2.5')}>
                        <Icon name={ICONS[item.key]} size={tabs ? 16 : 18} />
                        <span className="font-title-sm text-title-sm">{t(`nav.${item.key}`)}</span>
                      </span>
                      {count ? (
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full font-label-sm text-label-sm',
                            current
                              ? 'bg-on-primary text-primary-container'
                              : 'bg-surface-container-high text-on-surface',
                          )}
                        >
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {tabs ? null : sideNote}
        </div>
        <div className={tabs ? 'space-y-gutter' : 'xl:col-span-9 space-y-gutter'}>{children}</div>
      </div>
    </div>
  );
}
