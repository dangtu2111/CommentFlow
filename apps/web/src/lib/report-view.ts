/** Khoảng ngày báo cáo cho phép chọn (design/stitch/reports.html: 7/30 ngày). Giá trị khác → mặc định 7. */
export const REPORT_RANGES = [7, 30] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

const DAY_MS = 86_400_000;

export function parseReportRange(raw: string | string[] | undefined): ReportRange {
  return REPORT_RANGES.find((d) => String(d) === raw) ?? 7;
}

/** `from` bao gồm, `to` không bao gồm (khớp `ReportOptions`). */
export function reportWindow(days: ReportRange, now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
}

const DASH = '—';

/** 45s · 1m 12s · 1h 5m. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return DASH;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Một chữ số thập phân, bỏ ".0". */
export function formatPercent(ratio: number | null): string {
  if (ratio === null) return DASH;
  return `${Number((ratio * 100).toFixed(1))}%`;
}

export type HourBar = { hour: number; count: number; pct: number; peak: boolean };

/** Chiều cao cột theo cột lớn nhất (0–100); `peakHours` là giờ cao điểm do `buildReport` tính. */
export function hourBars(distribution: readonly number[], peakHours: readonly number[]): HourBar[] {
  const max = Math.max(0, ...distribution);
  return distribution.map((count, hour) => ({
    hour,
    count,
    pct: max === 0 ? 0 : Math.round((count / max) * 100),
    peak: peakHours.includes(hour),
  }));
}
