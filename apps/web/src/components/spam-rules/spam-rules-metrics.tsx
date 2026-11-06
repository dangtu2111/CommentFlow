import {
  BadgeCheck,
  Bolt,
  Contact,
  EyeOff,
  Gauge,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { SpamMetricsData } from '../../lib/spam-rules-sample';
import { MetricCard } from '../ui/metric-card';
import { TONE } from '../ui/rich';

/**
 * Bốn thẻ số liệu bảo vệ (design/stitch/spam-rules.html). `data` null = chưa có số liệu thật (chưa có nhật ký ẩn)
 * → "—" + ghi chú; có `data` thì đó là DỮ LIỆU MẪU `[MẪU]` (chỉ bản dev).
 */
export async function SpamRulesMetrics({ data }: { data: SpamMetricsData | null }) {
  const t = await getTranslations('spamRules.metrics');
  const sample = data !== null;
  const none = t('noData');
  return (
    <div className="metric-grid">
      <MetricCard
        sample={sample}
        label={t('hidden')}
        value={data?.hidden30d ?? null}
        unit={data ? t('hiddenUnit') : undefined}
        note={
          data ? (
            <>
              <TrendingUp size={12} aria-hidden="true" />
              {t('hiddenNote', { value: data.hiddenGrowthPercent })}
            </>
          ) : (
            none
          )
        }
        noteTone={data ? TONE.primary : TONE.neutral}
        icon={<EyeOff size={20} />}
      />
      <MetricCard
        sample={sample}
        label={t('leads')}
        value={data?.leads ?? null}
        unit={data ? t('leadsUnit') : undefined}
        note={
          data ? (
            <>
              <Sparkles size={12} aria-hidden="true" />
              {t('leadsNote')}
            </>
          ) : (
            none
          )
        }
        noteTone={data ? TONE.accent : TONE.neutral}
        icon={<Contact size={20} />}
        iconTone={TONE.accent}
      />
      <MetricCard
        sample={sample}
        label={t('falsePositive')}
        value={data ? `${data.falsePositivePercent}%` : null}
        note={
          data ? (
            <>
              <BadgeCheck size={12} aria-hidden="true" />
              {t('falsePositiveNote', { value: data.falsePositiveLimitPercent })}
            </>
          ) : (
            none
          )
        }
        icon={<SlidersHorizontal size={20} />}
      />
      <MetricCard
        sample={sample}
        label={t('reaction')}
        value={data?.reactionSeconds ?? null}
        unit={data ? t('reactionUnit') : undefined}
        note={
          data ? (
            <>
              <Bolt size={12} aria-hidden="true" />
              {t('reactionNote')}
            </>
          ) : (
            none
          )
        }
        noteTone={data ? TONE.primary : TONE.neutral}
        icon={<Gauge size={20} />}
      />
    </div>
  );
}
