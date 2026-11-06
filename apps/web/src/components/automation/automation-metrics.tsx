import { getTranslations } from 'next-intl/server';
import type { AutomationMetricsData } from '../../lib/automation-sample';
import { Icon, type IconName } from '../ui/icon';
import { Badge, Panel } from '../ui/tw-parts';

const SAMPLE_LABEL = '[MẪU]';

type Tile = {
  label: string;
  icon: IconName;
  iconClass: string;
  value: number | null;
  valueClass: string;
  unit?: string;
  unitClass: string;
  note: string;
  noteClass: string;
  noteIcon?: IconName;
};

function MetricTile({ tile, sample }: { tile: Tile; sample: boolean }) {
  return (
    <Panel size="lg" className="flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
          {tile.label}
        </span>
        <span className={`rounded-lg p-1.5 ${tile.iconClass}`}>
          <Icon name={tile.icon} size={18} />
        </span>
      </div>
      <div className="mt-space-md">
        <div className="flex items-baseline gap-2">
          <span className={`font-headline-lg text-headline-lg ${tile.valueClass}`}>
            {tile.value ?? '—'}
          </span>
          {tile.unit ? (
            <span className={`font-title-sm text-title-sm font-semibold ${tile.unitClass}`}>
              {tile.unit}
            </span>
          ) : null}
          {sample ? (
            <Badge variant="box" tone="neutral">
              {SAMPLE_LABEL}
            </Badge>
          ) : null}
        </div>
        <div
          className={`mt-1 flex items-center gap-1.5 font-label-sm text-label-sm ${tile.noteClass}`}
        >
          {tile.noteIcon ? <Icon name={tile.noteIcon} size={14} /> : null}
          <span>{tile.note}</span>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Bốn thẻ số liệu trong ngày (design/stitch/automation.html). `data` null = chưa có số liệu thật (chưa nối
 * pipeline gửi) → "—" + ghi chú; có `data` thì đó là DỮ LIỆU MẪU `[MẪU]` (chỉ bản dev).
 */
export async function AutomationMetrics({ data }: { data: AutomationMetricsData | null }) {
  const t = await getTranslations('automation.metrics');
  const none = t('noData');
  const muted = 'text-on-surface-variant';
  const tiles: Tile[] = [
    {
      label: t('sent'),
      icon: 'send',
      iconClass: 'bg-primary-fixed text-on-primary-fixed',
      value: data?.sentToday ?? null,
      valueClass: 'text-on-surface',
      unit: data ? t('sentUnit') : undefined,
      unitClass: 'text-primary',
      note: data ? t('accuracy', { value: data.accuracyPercent }) : none,
      noteClass: data ? 'text-primary-container' : muted,
      noteIcon: data ? 'verified' : undefined,
    },
    {
      label: t('pending'),
      icon: 'hourglass_top',
      iconClass: 'bg-tertiary-fixed text-on-tertiary-fixed',
      value: data?.pendingDelay ?? null,
      valueClass: 'text-tertiary',
      unit: data ? t('pendingUnit') : undefined,
      unitClass: 'text-tertiary',
      note: data ? t('pendingNote', { seconds: data.pendingAvgSeconds }) : none,
      noteClass: muted,
    },
    {
      label: t('cancelled'),
      icon: 'undo',
      iconClass: 'bg-surface-container-high text-on-surface-variant',
      value: data?.cancelledByStaff ?? null,
      valueClass: 'text-on-surface',
      unit: data ? t('cancelledUnit') : undefined,
      unitClass: muted,
      note: data ? t('cancelledNote') : none,
      noteClass: muted,
    },
    {
      label: t('flagged'),
      icon: 'error_outline',
      iconClass: 'bg-error-container text-on-error-container',
      value: data?.flaggedWrong ?? null,
      valueClass: 'text-on-surface',
      unit: data ? t('flaggedUnit') : undefined,
      unitClass: muted,
      note: data ? t('flaggedNote') : none,
      noteClass: data ? 'font-semibold text-primary' : muted,
    },
  ];
  return (
    <div id="auto-metrics" className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <MetricTile key={tile.label} tile={tile} sample={data !== null} />
      ))}
    </div>
  );
}
