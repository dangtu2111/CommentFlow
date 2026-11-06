import type { AutomationRule } from '@flow/ai';
import {
  ChevronDown,
  CircleStop,
  Eye,
  Filter,
  LayoutDashboard,
  MessageCircle,
  MessagesSquare,
  SlidersHorizontal,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card } from '../ui/card';
import { Chip } from '../ui/chip';
import { PageHeader } from '../ui/page-header';
import { type TabItem, Tabs } from '../ui/tabs';

/** Số kênh đang có ít nhất một ô "Tự động" (chỉ đếm từ cấu hình đã lưu, không phải số liệu bịa). */
export function countAutoChannels(rules: readonly AutomationRule[]): number {
  return new Set(rules.filter((r) => r.mode === 'auto').map((r) => r.channelId)).size;
}

/**
 * Đầu trang Tự động hóa (design/stitch/automation.html): tiêu đề + trạng thái "AI tự động đang chạy ở N/M kênh"
 * (tính từ cấu hình) + bộ lọc kênh và nút Dừng khẩn cấp (chưa có chức năng: vô hiệu + "Sắp có"), rồi thanh tab mục.
 * Tab "Bình luận/Tin nhắn/Cài đặt chung" nhảy tới khối tương ứng trong trang; Tổng quan và Chạy thử chưa có.
 */
export async function AutomationHeader({
  channelCount,
  autoChannelCount,
}: {
  channelCount: number;
  autoChannelCount: number;
}) {
  const t = await getTranslations('automation');
  const soon = { disabled: true, title: t('soonTitle') } as const;
  const tabs: TabItem[] = [
    {
      key: 'overview',
      href: '#auto-metrics',
      label: t('tabs.overview'),
      current: false,
      icon: <LayoutDashboard size={18} />,
      disabled: true,
    },
    {
      key: 'comment',
      href: '#auto-matrix-comment',
      label: t('tabs.comment'),
      current: true,
      icon: <MessageCircle size={18} />,
      badge: t('tabs.selected'),
    },
    {
      key: 'message',
      href: '#auto-matrix-message',
      label: t('tabs.message'),
      current: false,
      icon: <MessagesSquare size={18} />,
    },
    {
      key: 'general',
      href: '#auto-guard',
      label: t('tabs.general'),
      current: false,
      icon: <SlidersHorizontal size={18} />,
    },
    {
      key: 'shadow',
      href: '#auto-shadow',
      label: t('tabs.shadow'),
      current: false,
      icon: <Eye size={18} />,
      disabled: true,
    },
  ];

  return (
    <>
      <Card className="auto-top">
        <div className="auto-top-main">
          <PageHeader title={t('title')} subtitle={t('subtitle')} />
          <span className="auto-status">
            <span className="auto-status-dot" aria-hidden="true" />
            <span>{t('header.status')}</span>
            <strong>{t('header.running', { on: autoChannelCount, total: channelCount })}</strong>
          </span>
        </div>
        <div className="auto-top-actions">
          <button type="button" className="btn btn-secondary" {...soon}>
            <Filter size={16} aria-hidden="true" />
            {t('header.filterAll', { total: channelCount })}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled
            title={t('header.stopHint')}
            aria-label={`${t('header.stop')} — ${t('soon')}`}
          >
            <CircleStop size={16} aria-hidden="true" />
            {t('header.stop')}
          </button>
          <Chip tone="muted">{t('soon')}</Chip>
        </div>
      </Card>
      <Tabs items={tabs} label={t('tabs.label')} variant="toolbar" disabledNote={t('soon')} />
    </>
  );
}
