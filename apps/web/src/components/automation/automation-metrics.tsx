import { CircleAlert, Hourglass, Send, ShieldCheck, Undo2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { AutomationMetricsData } from '../../lib/automation-sample';
import { MetricCard } from '../ui/metric-card';
import { TONE } from '../ui/rich';

/**
 * Bốn thẻ số liệu trong ngày (design/stitch/automation.html). `data` null = chưa có số liệu thật (chưa nối
 * pipeline gửi) → "—" + ghi chú; có `data` thì đó là DỮ LIỆU MẪU `[MẪU]` (chỉ bản dev).
 */
export async function AutomationMetrics({ data }: { data: AutomationMetricsData | null }) {
  const t = await getTranslations('automation.metrics');
  const sample = data !== null;
  const none = t('noData');
  return (
    <div className="metric-grid" id="auto-metrics">
      <MetricCard
        large
        sample={sample}
        label={t('sent')}
        value={data?.sentToday ?? null}
        unit={data ? t('sentUnit') : undefined}
        note={data ? t('accuracy', { value: data.accuracyPercent }) : none}
        noteTone={data ? TONE.primary : TONE.neutral}
        icon={<Send size={18} />}
      />
      <MetricCard
        large
        sample={sample}
        label={t('pending')}
        value={data?.pendingDelay ?? null}
        unit={data ? t('pendingUnit') : undefined}
        note={data ? t('pendingNote', { seconds: data.pendingAvgSeconds }) : none}
        icon={<Hourglass size={18} />}
        iconTone={TONE.warm}
      />
      <MetricCard
        large
        sample={sample}
        label={t('cancelled')}
        value={data?.cancelledByStaff ?? null}
        unit={data ? t('cancelledUnit') : undefined}
        note={data ? t('cancelledNote') : none}
        icon={<Undo2 size={18} />}
        iconTone={TONE.neutral}
      />
      <MetricCard
        large
        sample={sample}
        label={t('flagged')}
        value={data?.flaggedWrong ?? null}
        unit={data ? t('flaggedUnit') : undefined}
        note={data ? t('flaggedNote') : none}
        noteTone={data ? TONE.primary : TONE.neutral}
        icon={data ? <ShieldCheck size={18} /> : <CircleAlert size={18} />}
        iconTone={TONE.danger}
      />
    </div>
  );
}
