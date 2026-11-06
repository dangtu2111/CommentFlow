import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AutomationView } from '../../../../components/automation/automation-view';
import { Notice } from '../../../../components/ui/tw-form';
import { TwPage } from '../../../../components/ui/tw-parts';
import {
  AUTOMATION_SAMPLE_CHANNELS,
  AUTOMATION_SAMPLE_DEFAULTS,
  AUTOMATION_SAMPLE_METRICS,
} from '../../../../lib/automation-sample';

/**
 * Xem giao diện Tự động hóa (design/stitch/automation.html) với kênh và số liệu MẪU `[MẪU]` — CHỈ khi
 * `NODE_ENV !== 'production'` (UI-first 06/11/2026). Dùng đúng `AutomationView` như trang thật; nút Lưu ở đây
 * không có hiệu lực (không có phiên Owner).
 */
export default async function DevAutomationPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations('automation');
  return (
    <TwPage>
      <AutomationView
        channels={AUTOMATION_SAMPLE_CHANNELS}
        defaults={AUTOMATION_SAMPLE_DEFAULTS}
        metrics={AUTOMATION_SAMPLE_METRICS}
        notices={<Notice tone="info">{t('sampleBanner')}</Notice>}
      />
    </TwPage>
  );
}
