import { localDateTimeToUtc, utcToLocalParts } from './zoned-time';

/**
 * Kéo một bài ĐÃ LÊN LỊCH sang ngày khác trên Lịch (CALENDAR-DND): giữ nguyên GIỜ địa phương của cửa hàng, đổi NGÀY. THUẦN.
 * Trả `null` nếu ngày đích sai định dạng hoặc giờ mới không nằm trong khoảng cho phép (cách hiện tại 2 phút – 90 ngày; DB kiểm lại).
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MIN_LEAD_MS = 2 * 60_000;
const MAX_LEAD_MS = 90 * 86_400_000;

export const isDay = (value: string): boolean => DAY.test(value);

export function moveToDay(
  currentUtc: Date,
  targetDay: string,
  timeZone: string,
  now: Date = new Date(),
): Date | null {
  if (!isDay(targetDay)) return null;
  const { time } = utcToLocalParts(currentUtc, timeZone);
  const next = localDateTimeToUtc(targetDay, time, timeZone);
  if (!next) return null;
  const lead = next.getTime() - now.getTime();
  return lead >= MIN_LEAD_MS && lead <= MAX_LEAD_MS ? next : null;
}
