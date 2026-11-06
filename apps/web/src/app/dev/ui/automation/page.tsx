import { DEFAULT_AUTOMATION_CONFIG } from '@flow/ai';
import { notFound } from 'next/navigation';
import { AutomationForm } from '../../../../components/automation/automation-form';
import { automationFormDefaults } from '../../../../lib/automation-form';

/** Mọi chữ ở trang mẫu dev đều gắn "[MẪU]" (không đi qua i18n vì không phải giao diện thật). */
const SAMPLE = {
  banner: '[MẪU] Kênh mẫu, cấu hình mặc định — không lưu được, không phải dữ liệu thật.',
} as const;

const SAMPLE_CHANNELS = [
  { id: 'mau-fb', name: '[MẪU] Trang Facebook', platform: 'facebook' },
  { id: 'mau-ig', name: '[MẪU] Instagram', platform: 'instagram' },
] as const;

const SAMPLE_DEFAULTS = automationFormDefaults({
  ...DEFAULT_AUTOMATION_CONFIG,
  rules: [
    { channelId: 'mau-fb', target: 'comment', label: 'price', mode: 'auto' },
    { channelId: 'mau-fb', target: 'comment', label: 'advice', mode: 'shadow' },
  ],
});

/**
 * Xem giao diện Tự động hóa (design/stitch/automation.png) với kênh MẪU — CHỈ khi `NODE_ENV !== 'production'`
 * (UI-first 06/11/2026, QAL1). Dùng đúng `AutomationForm` thật; nút Lưu ở đây không có hiệu lực.
 */
export default function DevAutomationPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide stack">
      <p className="badge badge-off">{SAMPLE.banner}</p>
      <AutomationForm channels={[...SAMPLE_CHANNELS]} defaults={SAMPLE_DEFAULTS} />
    </main>
  );
}
