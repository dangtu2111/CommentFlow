import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { ActivityCursorValue, ActivityView as View } from '../../lib/action-log-filters';
import { ACTIVITY_KPI_SAMPLE as K } from '../../lib/activity-sample';
import { Icon, type IconName } from '../ui/icon';
import { Badge, Panel, SoonButton } from '../ui/tw-parts';
import { type ActivityDetail, ActivityDetailPanel } from './activity-detail';
import { ActivityList, type ActivityListItem } from './activity-list';
import { ActivityToolbar } from './activity-toolbar';

const DASH = '—';

/** Màu ô biểu tượng + chữ số lớn theo từng thẻ số liệu (khớp HTML Stitch). */
const KPI_TONE = {
  total: { icon: 'bg-surface-container-low text-primary', value: 'text-on-surface' },
  ai: { icon: 'bg-secondary-fixed text-secondary', value: 'text-secondary' },
  human: { icon: 'bg-surface-container-high text-primary-container', value: 'text-on-surface' },
  reliability: { icon: 'bg-surface-container-low text-primary', value: 'text-primary' },
} as const;

function Kpi({
  label,
  icon,
  tone,
  value,
  aside,
  foot,
}: {
  label: string;
  icon: IconName;
  tone: keyof typeof KPI_TONE;
  value: string;
  aside: ReactNode;
  foot: ReactNode;
}) {
  const iconClass = KPI_TONE[tone].icon;
  const valueClass = KPI_TONE[tone].value;
  return (
    <Panel size="lg" className="relative flex flex-col justify-between overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="font-title-sm text-title-sm text-on-surface-variant">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="mt-space-md flex items-baseline justify-between">
        <span className={`font-headline-lg text-headline-lg font-bold ${valueClass}`}>{value}</span>
        {aside}
      </div>
      {foot}
    </Panel>
  );
}

/**
 * Trang Nhật ký (FR-092) dựng từ design/stitch/activity-log.html (Tailwind), CHỈ ĐỌC: dải đầu, 4 thẻ số liệu, thanh
 * lọc, bảng + ngăn kiểm tra. Dòng/lọc/chi tiết là dữ liệu thật của `action_logs`; cột/thẻ chưa có nguồn là `[MẪU]` (dev)
 * hoặc "—"; nút chưa có chức năng "Sắp có". Dùng chung trang thật và trang mẫu dev.
 */
export async function ActivityPageView({
  view,
  items,
  nextCursor,
  actions,
  timeZone,
  viewerId,
  isOwner,
  detail,
  selectedMissing,
  sample,
}: {
  view: View;
  items: ActivityListItem[];
  nextCursor: ActivityCursorValue | null;
  actions: string[];
  timeZone: string;
  viewerId: string;
  isOwner: boolean;
  detail: ActivityDetail | null;
  selectedMissing: boolean;
  sample: boolean;
}) {
  const t = await getTranslations('activity');
  const soon = t('ui.soon');
  const filtered = Boolean(view.actorType || view.action || view.fromDate || view.toDate);
  const mock = (value: string) => (sample ? value : DASH);
  return (
    <>
      <div className="flex flex-col justify-between gap-space-md bg-surface-container-lowest px-space-xl py-space-lg shadow-sm md:flex-row md:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="font-headline-sm text-headline-sm text-on-surface">{t('title')}</h1>
            <Badge tone="strong" className="px-2.5 text-on-surface-variant">
              <span className="text-primary">
                <Icon name="lock" size={12} />
              </span>
              {t('ui.readOnly')}
            </Badge>
            <Badge tone="low">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
              {t('ui.refreshNote')}
            </Badge>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {isOwner ? t('subtitle.owner') : t('subtitle.staff')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-space-sm">
          <SoonButton variant="soft" soon={soon} className="shadow-sm">
            <Icon name="cloud_download" size={16} />
            <span>{t('ui.exportAudit')}</span>
          </SoonButton>
          <SoonButton variant="soft" soon={soon} className="shadow-sm">
            <Icon name="archive" size={16} />
            <span>{t('ui.archive')}</span>
          </SoonButton>
          <SoonButton variant="primary" soon={soon} className="px-3 shadow-sm">
            <Icon name="autorenew" size={16} />
            <span>{t('ui.autoRefresh')}</span>
          </SoonButton>
        </div>
      </div>

      <div className="flex-1 space-y-space-lg px-space-xl py-space-lg">
        <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label={t('ui.kpi.total')}
            icon="timeline"
            tone="total"
            value={mock(K.total)}
            aside={
              <span className="inline-flex items-center gap-0.5 font-label-md text-label-md font-semibold text-primary">
                <Icon name="trending_up" size={14} />
                {mock(K.totalDelta)}
              </span>
            }
            foot={
              <div className="mt-space-sm h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-primary-container"
                  style={{ width: `${sample ? K.totalPct : 0}%` }}
                />
              </div>
            }
          />
          <Kpi
            label={t('ui.kpi.ai')}
            icon="auto_awesome"
            tone="ai"
            value={mock(K.ai)}
            aside={
              <span className="font-label-md text-label-md text-on-surface-variant">
                {mock(K.aiShare)}
              </span>
            }
            foot={
              <div className="mt-space-sm truncate font-label-sm text-label-sm text-on-surface-variant">
                {mock(K.aiBreakdown)}
              </div>
            }
          />
          <Kpi
            label={t('ui.kpi.human')}
            icon="groups"
            tone="human"
            value={mock(K.human)}
            aside={
              <span className="font-label-md text-label-md text-on-surface-variant">
                {mock(K.humanNote)}
              </span>
            }
            foot={
              <div className="mt-space-sm truncate font-label-sm text-label-sm text-on-surface-variant">
                {mock(K.humanBreakdown)}
              </div>
            }
          />
          <Kpi
            label={t('ui.kpi.reliability')}
            icon="verified_user"
            tone="reliability"
            value={mock(K.reliability)}
            aside={
              sample ? (
                <Badge tone="error">{K.reliabilityBadge}</Badge>
              ) : (
                <span className="font-label-md text-label-md text-on-surface-variant">{DASH}</span>
              )
            }
            foot={
              <div className="mt-space-sm truncate font-label-sm text-label-sm text-on-surface-variant">
                {mock(K.latency)}
              </div>
            }
          />
        </div>

        <ActivityToolbar
          view={view}
          actions={actions}
          showActor={isOwner}
          shown={items.length}
          sample={sample}
        />

        <div className="flex flex-col items-start gap-space-lg xl:flex-row">
          {items.length === 0 ? (
            <Panel size="lg" className="w-full text-center xl:flex-1">
              <h2 className="font-title-md text-title-md text-on-surface">
                {filtered ? t('empty.filteredTitle') : t('empty.title')}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {filtered ? t('empty.filteredBody') : t('empty.body')}
              </p>
            </Panel>
          ) : (
            <ActivityList
              view={view}
              items={items}
              nextCursor={nextCursor}
              timeZone={timeZone}
              viewerId={viewerId}
            />
          )}
          {detail ? (
            <ActivityDetailPanel
              entry={detail}
              timeZone={timeZone}
              viewerId={viewerId}
              sample={sample}
            />
          ) : (
            <Panel size="lg" className="w-full shrink-0 xl:w-[420px]" id="activity-detail-empty">
              {selectedMissing ? (
                <div role="alert">
                  <h2 className="font-title-md text-title-md text-on-surface">
                    {t('detail.notFoundTitle')}
                  </h2>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    {t('detail.notFoundBody')}
                  </p>
                </div>
              ) : (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {t('detail.empty')}
                </p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
