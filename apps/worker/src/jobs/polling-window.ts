/** Cửa sổ thời gian của quét bù (FR-023) và lấy bình luận cũ khi kết nối (FR-011). Thuần; hằng số xem QP2. */
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Chu kỳ chạy quét bù. */
export const POLL_INTERVAL_MS = 5 * MINUTE_MS;
/** Quét lùi thêm một đoạn so với lần quét trước để bù trễ/lệch giờ (ingest idempotent nên chồng là an toàn). */
export const POLL_OVERLAP_MS = 15 * MINUTE_MS;
/** Không quét xa hơn 7 ngày (FR-023: bài có hoạt động 7 ngày qua). */
export const MAX_POLL_LOOKBACK_MS = 7 * DAY_MS;
/** Bình luận mới hơn mức này còn đang chờ webhook: quét bù bỏ qua để "webhook im lặng" chỉ báo khi thật sự rớt. */
export const WEBHOOK_GRACE_MS = 5 * MINUTE_MS;

export const BACKFILL_DAYS = [3, 7, 30] as const;
export type BackfillDays = (typeof BACKFILL_DAYS)[number];

export function isBackfillDays(value: unknown): value is BackfillDays {
  return BACKFILL_DAYS.some((days) => days === value);
}

/** Mốc bắt đầu của một lần quét bù: lần đầu = 7 ngày; sau đó `lastPolledAt` − chồng, không cũ hơn 7 ngày, không ở tương lai. */
export function pollSince(lastPolledAt: Date | null, now: Date): Date {
  const oldest = now.getTime() - MAX_POLL_LOOKBACK_MS;
  if (!lastPolledAt) return new Date(oldest);
  const anchor = Math.min(lastPolledAt.getTime(), now.getTime());
  return new Date(Math.max(anchor - POLL_OVERLAP_MS, oldest));
}

export function backfillSince(days: BackfillDays, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
