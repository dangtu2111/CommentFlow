import { DEFAULT_AUTOMATION_CONFIG } from '@flow/ai';
import type { InboxChannel } from '@flow/db/runtime';
import { automationFormDefaults } from './automation-form';

/**
 * DỮ LIỆU MẪU `[MẪU]` để dựng giao diện Tự động hóa (UI-first, QUIC1). Chỉ dùng ở `/dev/ui/automation` và ở
 * trang thật khi `showSampleData()` (APP_ENV=dev). Không bao giờ hiện ở staging/production, không đưa vào test số liệu.
 */
export const AUTOMATION_SAMPLE_CHANNELS: InboxChannel[] = [
  { id: 'mau-fb', name: '[MẪU] Facebook Page "An Nhiên Store"', platform: 'facebook' },
  { id: 'mau-ig', name: '[MẪU] Instagram "@annhien.official"', platform: 'instagram' },
  { id: 'mau-tt', name: '[MẪU] TikTok "An Nhiên Fashion"', platform: 'tiktok' },
];

export const AUTOMATION_SAMPLE_DEFAULTS = automationFormDefaults({
  ...DEFAULT_AUTOMATION_CONFIG,
  delaySeconds: 120,
  dailyCap: 500,
  blockedKeywords: ['phốt', 'lừa đảo', 'hoàn tiền', 'rách', 'kém chất lượng', 'xấu'],
  signature: '— Trợ lý tự động của An Nhiên Store',
  rules: [
    { channelId: 'mau-fb', target: 'comment', label: 'price', mode: 'auto' },
    { channelId: 'mau-fb', target: 'comment', label: 'advice', mode: 'shadow' },
    { channelId: 'mau-fb', target: 'comment', label: 'purchase', mode: 'auto' },
    { channelId: 'mau-ig', target: 'comment', label: 'price', mode: 'auto' },
    { channelId: 'mau-ig', target: 'comment', label: 'purchase', mode: 'shadow' },
    { channelId: 'mau-tt', target: 'comment', label: 'price', mode: 'shadow' },
  ],
});

/** Số liệu trong ngày (mẫu). `null` ở trang thật = chưa có dữ liệu → "—". */
export type AutomationMetricsData = {
  sentToday: number;
  accuracyPercent: number;
  pendingDelay: number;
  pendingAvgSeconds: number;
  cancelledByStaff: number;
  flaggedWrong: number;
};

export const AUTOMATION_SAMPLE_METRICS: AutomationMetricsData = {
  sentToday: 142,
  accuracyPercent: 98.6,
  pendingDelay: 3,
  pendingAvgSeconds: 90,
  cancelledByStaff: 1,
  flaggedWrong: 0,
};
