import { listChannelAlerts, listWebhookSilentChannels } from '@flow/db/runtime';
import {
  type Banner,
  type BannerAudience,
  buildBannerModel,
  buildWebhookSilentBanner,
  type WebhookSilentBanner,
} from '../lib/channel-banner';
import { getDb } from './db';
import { getEnabledFbConfig } from './fb-connect-runtime';

export type ShellAlerts = {
  banners: Banner[];
  silent: WebhookSilentBanner | null;
  /** "Kết nối lại" chỉ hiện khi tính năng kết nối Facebook bật. */
  reconnect: boolean;
};

/**
 * Cảnh báo hệ thống của khung ứng dụng (kênh mất kết nối FR-012, webhook im lặng FR-023). Nạp MỘT lần cho cả banner
 * lẫn hộp thông báo. Lỗi khi nạp (DB chập chờn/cấu hình) KHÔNG làm hỏng khung: phần đó bị bỏ qua. Webhook im lặng chỉ
 * Owner thấy (RLS `webhook_events`).
 */
export async function loadShellAlerts(
  workspaceId: string,
  userId: string,
  role: BannerAudience,
): Promise<ShellAlerts> {
  let reconnect = false;
  try {
    reconnect = getEnabledFbConfig() !== null;
  } catch {
    reconnect = false;
  }
  let banners: Banner[] = [];
  try {
    const alerts = await getDb().withActor(workspaceId, userId, (tx) =>
      listChannelAlerts(tx, workspaceId),
    );
    banners = buildBannerModel(alerts, role);
  } catch {
    banners = [];
  }
  let silent: WebhookSilentBanner | null = null;
  if (role === 'owner') {
    try {
      const channels = await getDb().withActor(workspaceId, userId, (tx) =>
        listWebhookSilentChannels(tx, workspaceId),
      );
      silent = buildWebhookSilentBanner(channels, role);
    } catch {
      silent = null;
    }
  }
  return { banners, silent, reconnect };
}
