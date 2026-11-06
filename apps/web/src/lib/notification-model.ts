import type { Banner, BannerStatus, WebhookSilentBanner } from './channel-banner';

/**
 * Mô hình hộp thông báo (chuông ở đầu trang). Thuần. Nguồn DUY NHẤT hiện nay là các cảnh báo kênh thật (FR-012/FR-023);
 * không có thông báo "mẫu". Dùng lại đúng dữ liệu của banner để hai nơi không lệch nhau.
 */
export type NotificationItem =
  | { kind: 'channel'; status: BannerStatus; names: string[]; moreCount: number }
  | { kind: 'webhookSilent'; names: string[]; moreCount: number };

export type NotificationModel = { items: NotificationItem[]; hasUrgent: boolean };

export function buildNotifications(
  banners: Banner[],
  silent: WebhookSilentBanner | null,
): NotificationModel {
  const items: NotificationItem[] = banners.map((b) => ({
    kind: 'channel',
    status: b.status,
    names: b.names,
    moreCount: b.moreCount,
  }));
  if (silent)
    items.push({ kind: 'webhookSilent', names: silent.names, moreCount: silent.moreCount });
  return { items, hasUrgent: banners.some((b) => b.urgent) };
}
