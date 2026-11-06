import type { AutomationRule } from '@flow/ai';
import { getTranslations } from 'next-intl/server';
import { Icon, type IconName } from '../ui/icon';
import { Badge, SoonButton } from '../ui/tw-parts';

/** Số kênh đang có ít nhất một ô "Tự động" (chỉ đếm từ cấu hình đã lưu, không phải số liệu bịa). */
export function countAutoChannels(rules: readonly AutomationRule[]): number {
  return new Set(rules.filter((r) => r.mode === 'auto').map((r) => r.channelId)).size;
}

type TabSpec = {
  key: string;
  icon: IconName;
  href: string;
  current?: boolean;
  disabled?: boolean;
  dot?: boolean;
};

const TABS: readonly TabSpec[] = [
  { key: 'overview', icon: 'dashboard', href: '#auto-metrics', disabled: true },
  { key: 'comment', icon: 'chat_bubble', href: '#auto-matrix-comment', current: true },
  { key: 'message', icon: 'forum', href: '#auto-matrix-message' },
  { key: 'general', icon: 'tune', href: '#auto-guard' },
  { key: 'shadow', icon: 'visibility', href: '#auto-shadow', disabled: true, dot: true },
];

const TAB_BASE =
  'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 font-title-sm text-title-sm transition-colors';

/**
 * Đầu trang Tự động hóa (design/stitch/automation.html): thanh tiêu đề + trạng thái "AI tự động đang chạy ở N/M
 * kênh" (tính từ cấu hình) + bộ lọc kênh và nút Dừng khẩn cấp (chưa có chức năng: vô hiệu + "Sắp có"), rồi thanh
 * tab mục. Tab Bình luận/Tin nhắn/Cài đặt chung nhảy tới khối tương ứng; Tổng quan và Chạy thử chưa có.
 */
export async function AutomationHeader({
  channelCount,
  autoChannelCount,
}: {
  channelCount: number;
  autoChannelCount: number;
}) {
  const t = await getTranslations('automation');
  const soon = t('soonTitle');
  return (
    <>
      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-space-md">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-headline-md text-headline-md text-on-surface">{t('title')}</h1>
              <Badge tone="secondary" className="font-semibold uppercase tracking-wide">
                {t('header.badge')}
              </Badge>
            </div>
            <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
              {t('subtitle')}
            </p>
          </div>
          <div className="hidden h-8 w-px bg-surface-container-highest sm:block" />
          <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-container opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-container" />
            </span>
            <span className="font-title-sm text-title-sm text-on-surface">
              {t('header.status')}
            </span>
            <span className="font-title-sm text-title-sm text-primary">
              {t('header.running', { on: autoChannelCount, total: channelCount })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <SoonButton variant="soft" soon={soon} className="shadow-sm">
            <Icon name="filter_list" size={16} className="text-primary" />
            <span>{t('header.filterAll', { total: channelCount })}</span>
            <Icon name="expand_more" size={14} className="text-on-surface-variant" />
          </SoonButton>
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            title={t('header.stopHint')}
            aria-label={`${t('header.stop')} — ${t('soon')}`}
            className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-error px-4 py-2 font-title-sm text-title-sm text-on-error opacity-70 shadow-sm"
          >
            <Icon name="stop_circle" size={16} />
            <span>{t('header.stop')}</span>
          </button>
          <Badge tone="neutral">{t('soon')}</Badge>
        </div>
      </div>
      <nav
        aria-label={t('tabs.label')}
        className="flex items-center gap-2 overflow-x-auto rounded-xl bg-surface-container-low p-1.5 pb-1.5"
      >
        {TABS.map((tab) => {
          const label = t(`tabs.${tab.key}`);
          const body = (
            <>
              <Icon name={tab.icon} size={18} />
              <span>{label}</span>
              {tab.current ? <Badge tone="primary">{t('tabs.selected')}</Badge> : null}
              {tab.dot ? <span className="h-2 w-2 rounded-full bg-tertiary-container" /> : null}
            </>
          );
          if (tab.disabled) {
            return (
              <span
                key={tab.key}
                aria-disabled="true"
                title={t('soon')}
                className={`${TAB_BASE} cursor-not-allowed text-on-surface-variant opacity-70`}
              >
                {body}
              </span>
            );
          }
          return (
            <a
              key={tab.key}
              href={tab.href}
              aria-current={tab.current ? 'true' : undefined}
              className={`${TAB_BASE} ${
                tab.current
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              {body}
            </a>
          );
        })}
      </nav>
    </>
  );
}
