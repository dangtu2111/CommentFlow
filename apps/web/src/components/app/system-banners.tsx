import { listChannelAlerts } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import { type BannerAudience, buildBannerModel } from '../../lib/channel-banner';
import { getDb } from '../../server/db';

/**
 * Banner hệ thống (docs/08 §3) — hiện tại: kênh hết hạn/bị thu hồi/lỗi (FR-012). Lấp khe `data-slot="banners"` của
 * khung ứng dụng. Lỗi khi nạp (DB chập chờn) KHÔNG làm hỏng khung: bỏ qua banner. Layout giữ nguyên khi chuyển trang
 * trong nhóm nên banner cập nhật sau lần tải đầy đủ kế tiếp. Chưa có nút "Kết nối lại" (cần FB-OAUTH).
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
  try {
    const alerts = await getDb().withActor(workspaceId, userId, (tx) =>
      listChannelAlerts(tx, workspaceId),
    );
    banners = buildBannerModel(alerts, role);
  } catch {
    banners = [];
  }
  if (banners.length === 0) return null;
  const t = await getTranslations('banners');
  return (
    <div className="banners">
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
        </div>
      ))}
    </div>
  );
}
