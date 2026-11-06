import { TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { FB_START_PATH } from '../../lib/fb-connect-view';
import type { ShellAlerts } from '../../server/shell-alerts';

/**
 * Banner hệ thống (docs/08 §3): kênh hết hạn/bị thu hồi/lỗi (FR-012) + webhook im lặng (FR-023), kiểu thanh cảnh báo
 * (design/stitch/channel-disconnected.png). Lấp khe `data-slot="banners"` của khung ứng dụng; dữ liệu nạp một lần ở
 * layout (`loadShellAlerts`). Owner thấy "Kết nối lại" (→ bắt đầu OAuth) khi FB-OAUTH bật.
 */
export async function SystemBanners({ alerts }: { alerts: ShellAlerts }) {
  const { banners, silent, reconnect } = alerts;
  if (banners.length === 0 && !silent) return null;
  const t = await getTranslations('banners');
  return (
    <div className="banners">
      {silent ? (
        <div className="banner banner-webhook-silent" role="status">
          <TriangleAlert size={20} aria-hidden="true" className="banner-icon" />
          <div className="banner-text">
            <p className="banner-title">
              {t('webhookSilent.title', { names: silent.names.join(', ') })}
              {silent.moreCount > 0 ? ` ${t('channel.more', { count: silent.moreCount })}` : ''}
            </p>
            <p className="banner-body">{t('webhookSilent.body')}</p>
          </div>
        </div>
      ) : null}
      {banners.map((banner) => (
        <div
          key={banner.status}
          className={`banner banner-${banner.status}`}
          role={banner.urgent ? 'alert' : 'status'}
        >
          <TriangleAlert size={20} aria-hidden="true" className="banner-icon" />
          <div className="banner-text">
            <p className="banner-title">
              {t(`channel.${banner.status}.title`, { names: banner.names.join(', ') })}
              {banner.moreCount > 0 ? ` ${t('channel.more', { count: banner.moreCount })}` : ''}
            </p>
            <p className="banner-body">{t(`channel.${banner.status}.body.${banner.audience}`)}</p>
          </div>
          {reconnect && banner.audience === 'owner' ? (
            <a className="btn btn-secondary banner-action" href={FB_START_PATH}>
              {t('channel.reconnect')}
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}
