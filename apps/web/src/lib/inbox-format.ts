import type { Locale } from '@flow/shared';

/** Định dạng hiển thị của danh sách bình luận. Thuần (nhận `now` từ ngoài) để test được. */

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const MAX_RELATIVE_DAYS = 30;

const isValid = (date: Date | null): date is Date => date !== null && !Number.isNaN(date.getTime());

/** "5 phút trước" / "5 minutes ago"; từ 30 ngày trở lên hiện ngày; tương lai (lệch đồng hồ) = "bây giờ". */
export function formatRelativeTime(date: Date | null, now: Date, locale: Locale): string {
  if (!isValid(date)) return '';
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (seconds < 45) return rtf.format(0, 'second');
  if (seconds < HOUR) return rtf.format(-Math.max(1, Math.floor(seconds / MINUTE)), 'minute');
  if (seconds < DAY) return rtf.format(-Math.floor(seconds / HOUR), 'hour');
  const days = Math.floor(seconds / DAY);
  if (days < MAX_RELATIVE_DAYS) return rtf.format(-days, 'day');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/** Thời điểm đầy đủ (cho `title`), theo ngôn ngữ giao diện và múi giờ của workspace. */
export function formatAbsoluteTime(date: Date | null, locale: Locale, timeZone: string): string {
  if (!isValid(date)) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}
