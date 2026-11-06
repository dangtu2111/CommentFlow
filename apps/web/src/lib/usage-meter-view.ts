import { type UsageCounts, type UsageLevel, usageStatus } from '@flow/shared';

/**
 * Mô hình hiển thị đồng hồ lượt AI (FR-090, BR-06). Thuần: quy tắc 80%/100% nằm ở `usageStatus` của `@flow/shared`;
 * ở đây chỉ chọn số để vẽ và có đề xuất mua thêm/nâng gói hay không.
 */
export type UsageMeterView = {
  level: UsageLevel;
  /** Lượt đã dùng thật (có thể vượt hạn mức nếu dữ liệu bị lệch). */
  used: number;
  capacity: number;
  remaining: number;
  /** 0–100 cho thanh tiến độ, không bao giờ quá 100. */
  percent: number;
  /** Từ 80%: gợi ý mua thêm/nâng gói; ở 100%: bắt buộc (AI dừng). */
  showUpgrade: boolean;
};

export function buildUsageMeterView(counts: UsageCounts): UsageMeterView {
  const status = usageStatus(counts);
  return {
    level: status.level,
    used: counts.used,
    capacity: status.capacity,
    remaining: status.remaining,
    percent: Math.min(status.percent, 100),
    showUpgrade: status.level !== 'ok',
  };
}
