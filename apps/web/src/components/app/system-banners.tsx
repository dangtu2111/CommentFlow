import { listChannelAlerts, listWebhookSilentChannels } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import {
  type BannerAudience,
  buildBannerModel,
  buildWebhookSilentBanner,
} from '../../lib/channel-banner';
import { FB_START_PATH } from '../../lib/fb-connect-view';
import { getDb } from '../../server/db';
import { getEnabledFbConfig } from '../../server/fb-connect-runtime';

/**
 * Banner hệ thống (docs/08 §3) — hiện tại: kênh hết hạn/bị thu hồi/lỗi (FR-012). Lấp khe `data-slot="banners"` của
 * khung ứng dụng. Lỗi khi nạp (DB chập chờn) KHÔNG làm hỏng khung: bỏ qua banner. Layout giữ nguyên khi chuyển trang
 * trong nhóm nên banner cập nhật sau lần tải đầy đủ kế tiếp. Owner thấy "Kết nối lại" (→ bắt đầu OAuth) khi FB-OAUTH bật.
 */
export async function SystemBanners({
  workspaceId,
  userId,
  role,
}: {
  workspaceId: string;
  userId: string;
  role: BannerAudience;
}) {
  let banners: ReturnType<typeof buildBannerModel> = [];
  // "Kết nối lại" chỉ hiện khi tính năng kết nối Facebook bật; lấy kênh về trang Kênh (nơi bắt đầu OAuth).
  let reconnect = false;
  try {
    reconnect = getEnabledFbConfig() !== null;
  } catch {
    reconnect = false;
  }
  try {
    const alerts = await getDb().withActor(workspaceId, userId, (tx) =>
      listChannelAlerts(tx, workspaceId),
    );
    banners = buildBannerModel(alerts, role);
  } catch {
    banners = [];
  }
  // FR-023: webhook im lặng (chỉ Owner; lỗi nạp → bỏ qua như các banner khác).
  let silent: ReturnType<typeof buildWebhookSilentBanner> = null;
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
  if (banners.length === 0 && !silent) return null;
  const t = await getTranslations('banners');
  return (
    <div className="banners">
      {silent ? (
        <div className="banner banner-webhook-silent" role="status">
          <p className="banner-title">
            {t('webhookSilent.title', { names: silent.names.join(', ') })}
            {silent.moreCount > 0 ? ` ${t('channel.more', { count: silent.moreCount })}` : ''}
          </p>
          <p className="banner-body">{t('webhookSilent.body')}</p>
        </div>
      ) : null}
      {banners.map((banner) => (
        <div
          key={banner.status}
          className={`banner banner-${banner.status}`}
          role={banner.urgent ? 'alert' : 'status'}
        >
          <p className="banner-title">
            {t(`channel.${banner.status}.title`, { names: banner.names.join(', ') })}
            {banner.moreCount > 0 ? ` ${t('channel.more', { count: banner.moreCount })}` : ''}
          </p>
          <p className="banner-body">{t(`channel.${banner.status}.body.${banner.audience}`)}</p>
          {reconnect && banner.audience === 'owner' ? (
            <a className="btn btn-secondary" href={FB_START_PATH}>
              {t('channel.reconnect')}
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}
