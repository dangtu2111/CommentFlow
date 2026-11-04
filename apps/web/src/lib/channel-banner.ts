/**
 * Mô hình banner trạng thái kênh (FR-012). Thuần, không phụ thuộc React/DB. Chỉ dữ liệu thật; không có liên kết
 * "Kết nối lại" khi chưa có luồng kết nối (FB-OAUTH) — gap `CH-RECONNECT-ACTION`.
 */
export type BannerStatus = 'expired' | 'revoked' | 'error';
export type ChannelAlertInput = {
  id: string;
  name: string;
  platform: string;
  status: BannerStatus;
};
export type BannerAudience = 'owner' | 'staff';

export type Banner = {
  status: BannerStatus;
  /** Tối đa `MAX_NAMES` tên kênh (đúng thứ tự đầu vào). */
  names: string[];
  moreCount: number;
  audience: BannerAudience;
  /** Khẩn cấp (kênh không dùng được): thông báo kiểu alert; còn lại kiểu status. */
  urgent: boolean;
};

export const MAX_BANNER_NAMES = 3;
const ORDER: readonly BannerStatus[] = ['expired', 'revoked', 'error'];

export function buildBannerModel(alerts: ChannelAlertInput[], role: BannerAudience): Banner[] {
  return ORDER.flatMap((status) => {
    const matching = alerts.filter((a) => a.status === status);
    if (matching.length === 0) return [];
    return [
      {
        status,
        names: matching.slice(0, MAX_BANNER_NAMES).map((a) => a.name),
        moreCount: Math.max(0, matching.length - MAX_BANNER_NAMES),
        audience: role,
        urgent: status !== 'error',
      },
    ];
  });
}
