import { getTranslations } from 'next-intl/server';
import type { SpamMetricsData } from '../../lib/spam-rules-sample';
import { Icon, type IconName } from '../ui/icon';
import { Badge, Panel } from '../ui/tw-parts';

const SAMPLE_LABEL = '[MẪU]';

type Tile = {
  label: string;
  value: string | number | null;
  unit?: string;
  unitClass: string;
  note: string;
  noteClass: string;
  noteIcon?: IconName;
  icon: IconName;
  iconClass: string;
};

function MetricTile({ tile, sample }: { tile: Tile; sample: boolean }) {
  return (
    <Panel className="flex items-center justify-between">
      <div className="space-y-1">
        <div className="font-label-sm text-label-sm text-on-surface-variant">{tile.label}</div>
        <div className="flex items-baseline gap-1.5 font-headline-sm text-headline-sm font-bold text-on-surface">
          <span>{tile.value ?? '—'}</span>
          {tile.unit ? (
            <span className={`font-body-sm text-body-sm font-normal ${tile.unitClass}`}>
              {tile.unit}
            </span>
          ) : null}
          {sample ? (
            <Badge variant="box" tone="neutral">
              {SAMPLE_LABEL}
            </Badge>
          ) : null}
        </div>
        <div className={`flex items-center gap-0.5 font-label-sm text-label-sm ${tile.noteClass}`}>
          {tile.noteIcon ? <Icon name={tile.noteIcon} size={12} /> : null}
          <span>{tile.note}</span>
        </div>
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tile.iconClass}`}>
        <Icon name={tile.icon} size={24} />
      </div>
    </Panel>
  );
}

/**
 * Bốn thẻ số liệu bảo vệ (design/stitch/spam-rules.html). `data` null = chưa có số liệu thật (chưa có nhật ký ẩn)
 * → "—" + ghi chú; có `data` thì đó là DỮ LIỆU MẪU `[MẪU]` (chỉ bản dev).
 */
export async function SpamRulesMetrics({ data }: { data: SpamMetricsData | null }) {
  const t = await getTranslations('spamRules.metrics');
  const none = t('noData');
  const muted = 'text-on-surface-variant';
  const tiles: Tile[] = [
    {
      label: t('hidden'),
      value: data?.hidden30d ?? null,
      unit: data ? t('hiddenUnit') : undefined,
      unitClass: 'text-primary-container',
      note: data ? t('hiddenNote', { value: data.hiddenGrowthPercent }) : none,
      noteClass: data ? 'text-primary' : muted,
      noteIcon: data ? 'trending_up' : undefined,
      icon: 'visibility_off',
      iconClass: 'bg-surface-container-low text-primary-container',
    },
    {
      label: t('leads'),
      value: data?.leads ?? null,
      unit: data ? t('leadsUnit') : undefined,
      unitClass: 'text-secondary',
      note: data ? t('leadsNote') : none,
      noteClass: data ? 'text-secondary' : muted,
      noteIcon: data ? 'auto_awesome' : undefined,
      icon: 'contact_phone',
      iconClass: 'bg-secondary-fixed text-on-secondary-fixed',
    },
    {
      label: t('falsePositive'),
      value: data ? `${data.falsePositivePercent}%` : null,
      unitClass: muted,
      note: data ? t('falsePositiveNote', { value: data.falsePositiveLimitPercent }) : none,
      noteClass: muted,
      noteIcon: data ? 'verified' : undefined,
      icon: 'tune',
      iconClass: 'bg-surface-container-low text-primary',
    },
    {
      label: t('reaction'),
      value: data?.reactionSeconds ?? null,
      unit: data ? t('reactionUnit') : undefined,
      unitClass: muted,
      note: data ? t('reactionNote') : none,
      noteClass: data ? 'text-primary' : muted,
      noteIcon: data ? 'bolt' : undefined,
      icon: 'speed',
      iconClass: 'bg-surface-container-low text-primary-container',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <MetricTile key={tile.label} tile={tile} sample={data !== null} />
      ))}
    </div>
  );
}
