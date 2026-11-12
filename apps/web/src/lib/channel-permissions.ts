import {
  evaluateFbPermissions,
  FB_REQUIRED_PERMISSIONS,
  type FbPermissionFeature,
} from '@flow/shared';

/**
 * Trạng thái quyền Facebook của một kênh để hiển thị ở Cài đặt → Kênh. Thuần. Quyền lưu ở `channels.scopes` là quyền ĐÃ CẤP theo Meta, được làm mới mỗi lần
 * "Kiểm tra kết nối"; trước lần kiểm đầu (và với kênh không phải Facebook/không còn kết nối) ta KHÔNG kết luận đủ hay thiếu (`unknown`).
 */
export type ChannelPermissionView = {
  state: 'unknown' | 'ok' | 'missing';
  items: Array<{ permission: string; feature: FbPermissionFeature; granted: boolean }>;
  missing: string[];
  missingFeatures: FbPermissionFeature[];
};

export function channelPermissionView(channel: {
  platform: string;
  status: string;
  lastCheckedAt: Date | null;
  scopes: readonly string[];
}): ChannelPermissionView {
  const report = evaluateFbPermissions(channel.scopes);
  const granted = new Set(report.granted);
  const items = FB_REQUIRED_PERMISSIONS.map((item) => ({
    permission: item.permission,
    feature: item.feature,
    granted: granted.has(item.permission),
  }));
  const known =
    channel.platform === 'facebook' && channel.status === 'connected' && channel.lastCheckedAt;
  return {
    state: !known ? 'unknown' : report.sufficient ? 'ok' : 'missing',
    items,
    missing: report.missing,
    missingFeatures: report.missingFeatures,
  };
}
