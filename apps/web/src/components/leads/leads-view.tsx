import type { LeadRow } from '@flow/db/runtime';
import type { LeadStage } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LEAD_STAGES } from '../../lib/lead-view';
import { LEAD_CARDS_SAMPLE, LEAD_COUNTS_SAMPLE, LEAD_KPI_SAMPLE } from '../../lib/leads-sample';
import { Icon, type IconName } from '../ui/icon';
import { Badge, Panel, SoonButton } from '../ui/tw-parts';
import { LeadBoard } from './lead-board';
import { LeadDrawer } from './lead-drawer';

const DASH = '—';

/** Màu ô biểu tượng + chữ số lớn theo từng thẻ số liệu (khớp HTML Stitch). */
const KPI_TONE = {
  total: { icon: 'bg-surface-container-low text-primary-container', value: 'text-on-surface' },
  ai: { icon: 'bg-secondary-fixed text-on-secondary-fixed', value: 'text-on-surface' },
  won: { icon: 'bg-surface-container-high text-primary', value: 'text-on-surface' },
  revenue: { icon: 'bg-tertiary-fixed text-on-tertiary-fixed', value: 'text-primary' },
} as const;

const FILTERS = [
  { icon: 'hub', tone: 'text-primary', label: 'ui.filter.platform', value: 'ui.filter.all' },
  { icon: 'badge', tone: 'text-secondary', label: 'ui.filter.owner', value: 'ui.filter.all' },
  {
    icon: 'filter_alt',
    tone: 'text-on-surface-variant',
    label: 'ui.filter.source',
    value: 'ui.filter.sourceHidden',
  },
] as const;

function Kpi({
  label,
  badge,
  value,
  aside,
  icon,
  tone,
  left,
  right,
}: {
  label: string;
  badge?: string;
  value: ReactNode;
  aside?: ReactNode;
  icon: IconName;
  tone: keyof typeof KPI_TONE;
  left: ReactNode;
  right: ReactNode;
}) {
  const valueClass = KPI_TONE[tone].value;
  const iconClass = KPI_TONE[tone].icon;
  return (
    <Panel className="relative flex flex-col justify-between overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              {label}
            </span>
            {badge ? (
              <Badge variant="box" tone="secondary">
                {badge}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-headline-lg text-headline-lg ${valueClass}`}>{value}</span>
            {aside}
          </div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon name={icon} size={20} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between pt-3 font-label-sm text-label-sm text-on-surface-variant">
        {left}
        {right}
      </div>
    </Panel>
  );
}

/**
 * Thân trang Khách tiềm năng dựng từ design/stitch/leads.html (Tailwind), CHỈ ĐỌC: tiêu đề, 4 thẻ số liệu, thanh lọc,
 * bảng Kanban + ngăn chi tiết. Số liệu thật: tổng và "đã chốt" theo giai đoạn; phần còn lại `[MẪU]` ở dev hoặc "—".
 * Dùng chung trang thật và trang mẫu dev.
 */
export async function LeadsView({
  leads,
  counts,
  sample,
}: {
  leads: LeadRow[];
  counts: Record<LeadStage, number>;
  sample: boolean;
}) {
  const t = await getTranslations('leads');
  const soon = t('ui.soon');
  const useSampleCards = sample && leads.length === 0;
  const shownCounts: Record<LeadStage, number> = useSampleCards
    ? { ...LEAD_COUNTS_SAMPLE }
    : counts;
  const total = LEAD_STAGES.reduce((sum, stage) => sum + shownCounts[stage], 0);
  const mock = (value: string | number) => (sample ? value : DASH);
  const rate = total > 0 ? `${Math.round((shownCounts.won / total) * 1000) / 10}%` : DASH;
  const k = LEAD_KPI_SAMPLE;
  return (
    <>
      <div className="flex flex-col justify-between gap-space-md xl:flex-row xl:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-space-sm">
            <Badge variant="box" tone="primary" className="uppercase tracking-wider">
              <Icon name="auto_fix_high" size={12} />
              {t('ui.badge')}
            </Badge>
            <span className="flex items-center gap-1 font-label-md text-label-md text-on-surface-variant">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
              {t('ui.syncNote')}
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
            {t('title')}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{t('ui.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-space-sm">
          <SoonButton variant="neutral" soon={soon}>
            <Icon name="file_download" size={16} />
            <span>{t('ui.export')}</span>
          </SoonButton>
          <SoonButton variant="neutral" soon={soon}>
            <Icon name="checklist" size={16} />
            <span>{t('ui.bulk')}</span>
          </SoonButton>
          <SoonButton variant="primary" soon={soon}>
            <Icon name="person_add" size={16} />
            <span>{t('ui.addManual')}</span>
          </SoonButton>
        </div>
      </div>

      <section
        className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4"
        aria-label={t('kpi.label')}
      >
        <Kpi
          label={t('ui.kpi.total')}
          value={total}
          icon="group"
          tone="total"
          aside={
            <span className="flex items-center font-label-sm text-label-sm font-semibold text-primary">
              <Icon name="trending_up" size={12} /> {mock(k.totalDelta)}
            </span>
          }
          left={<span>{t('ui.kpi.vsLast', { n: mock(k.prevMonth) })}</span>}
          right={
            <span className="font-medium text-on-surface">
              {t('ui.kpi.quota', { pct: mock(k.quota) })}
            </span>
          }
        />
        <Kpi
          label={t('ui.kpi.extracted')}
          badge={t('ui.kpi.aiScan')}
          value={mock(k.extracted)}
          icon="shield_with_heart"
          tone="ai"
          aside={
            <span className="font-title-sm text-title-sm font-semibold text-secondary">
              {mock(k.extractedPct)}
            </span>
          }
          left={
            <span className="flex items-center gap-1 font-medium text-primary">
              <Icon name="visibility_off" size={12} />{' '}
              {t('ui.kpi.hiddenPhones', { pct: mock(k.hiddenPhones) })}
            </span>
          }
          right={<span>{t('ui.kpi.savedHours', { h: mock(k.savedHours) })}</span>}
        />
        <Kpi
          label={t('ui.kpi.won')}
          value={shownCounts.won}
          icon="shopping_cart_checkout"
          tone="won"
          aside={
            <span className="font-title-sm text-title-sm font-semibold text-primary">
              {t('ui.kpi.rate', { pct: rate })}
            </span>
          }
          left={
            <span>
              {t('ui.kpi.closeTime')} <strong>{mock(k.closeMinutes)}</strong>
            </span>
          }
          right={
            <span className="font-medium text-primary">
              {t('ui.kpi.vsWeek', { pct: mock(k.wonDelta) })}
            </span>
          }
        />
        <Kpi
          label={t('ui.kpi.revenue')}
          value={
            <>
              {mock(k.revenue)}
              <span className="text-base font-normal">{sample ? 'đ' : ''}</span>
            </>
          }
          icon="payments"
          tone="revenue"
          left={<span>{t('ui.kpi.aov', { v: mock(k.aov) })}</span>}
          right={
            <span className="font-medium text-primary">
              {t('ui.kpi.pendingPay', { n: mock(k.pendingPay) })}
            </span>
          }
        />
      </section>

      <Panel size="sm" className="space-y-space-sm">
        <div className="flex flex-col items-stretch justify-between gap-space-sm lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-space-sm">
            <div className="relative max-w-md flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Icon name="search" size={18} />
              </span>
              <input
                type="text"
                disabled
                title={soon}
                placeholder={t('ui.search')}
                aria-label={t('ui.search')}
                className="w-full cursor-not-allowed rounded-lg bg-surface-container-low py-2 pl-9 pr-4 font-body-md text-body-md text-on-surface opacity-70"
              />
            </div>
            <div className="flex shrink-0 items-center rounded-lg bg-surface-container-low p-1">
              <span className="flex items-center gap-1.5 rounded-md bg-surface-container-lowest px-3 py-1.5 font-title-sm text-title-sm text-on-surface shadow-sm">
                <span className="text-primary-container">
                  <Icon name="view_kanban" size={16} />
                </span>
                {t('ui.viewKanban')}
              </span>
              <span
                aria-disabled="true"
                title={soon}
                className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 font-title-sm text-title-sm text-on-surface-variant opacity-70"
              >
                <Icon name="table_rows" size={16} />
                {t('ui.viewList')}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {FILTERS.map((filter) => (
              <SoonButton
                key={filter.label}
                variant="soft"
                soon={soon}
                className="gap-1.5 px-3 font-label-md text-label-md"
              >
                <span className={filter.tone}>
                  <Icon name={filter.icon} size={14} />
                </span>
                <span>
                  {t(filter.label)}: <strong>{t(filter.value)}</strong>
                </span>
                <Icon name="expand_more" size={12} />
              </SoonButton>
            ))}
            <SoonButton
              variant="soft"
              soon={soon}
              className="gap-1.5 px-3 font-label-md text-label-md"
            >
              <Icon name="calendar_today" size={14} />
              <span>{t('ui.filter.days30')}</span>
              <Icon name="expand_more" size={12} />
            </SoonButton>
            <SoonButton variant="icon" soon={soon} label={t('ui.filter.reset')}>
              <Icon name="restart_alt" size={16} />
            </SoonButton>
          </div>
        </div>
      </Panel>

      {total === 0 && !useSampleCards ? (
        <div className="rounded-xl bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface-variant">
          <strong className="text-on-surface">{t('empty.title')}</strong> {t('empty.body')}
        </div>
      ) : null}

      <div className="grid grid-cols-12 items-start gap-space-lg">
        <LeadBoard
          leads={leads}
          counts={shownCounts}
          sampleCards={useSampleCards ? LEAD_CARDS_SAMPLE : undefined}
        />
        <LeadDrawer sample={sample} />
      </div>
    </>
  );
}
