import type { InboxChannel } from '@flow/db/runtime';
import type { ReactNode } from 'react';
import type { AutomationFormDefaults } from '../../lib/automation-form';
import type { AutomationMetricsData } from '../../lib/automation-sample';
import { AutomationForm } from './automation-form';
import { AutomationHeader, countAutoChannels } from './automation-header';
import { AutomationMetrics } from './automation-metrics';

/**
 * Cả màn Tự động hóa dùng chung cho trang thật `/app/automation` và trang mẫu `/dev/ui/automation`, để hai nơi
 * không lệch nhau. `metrics` null = chưa có số liệu thật. `notices` (banner lưu/lỗi) đứng giữa đầu trang và thẻ số liệu.
 */
export async function AutomationView({
  channels,
  defaults,
  metrics,
  notices,
}: {
  channels: InboxChannel[];
  defaults: AutomationFormDefaults;
  metrics: AutomationMetricsData | null;
  notices?: ReactNode;
}) {
  return (
    <>
      <AutomationHeader
        channelCount={channels.length}
        autoChannelCount={countAutoChannels(defaults.rules)}
      />
      {notices}
      <AutomationMetrics data={metrics} />
      <AutomationForm
        channels={channels}
        defaults={defaults}
        usedToday={metrics?.sentToday ?? null}
      />
    </>
  );
}
