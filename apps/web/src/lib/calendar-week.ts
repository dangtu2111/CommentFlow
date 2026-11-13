/**
 * Tuần của Lịch đăng (design/stitch/calendar.html: lưới 7 cột Thứ 2 → Chủ nhật). THUẦN, làm việc với chuỗi ngày `YYYY-MM-DD` (không giờ) bằng số học UTC
 * nên không lệch theo múi giờ máy. "Hôm nay" tính theo múi giờ của WORKSPACE (`todayIn`); ngày/giờ của từng bài do truy vấn đổi sang múi giờ workspace ở DB.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Không dựng tuần xa hơn ±5 năm so với hôm nay (tham số URL do người dùng tự gõ). */
const MAX_YEARS_AWAY = 5;

const toUtc = (iso: string): Date => {
  const [, y, m, d] = ISO_DATE.exec(iso) as RegExpExecArray;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
};
const fromUtc = (date: Date): string => date.toISOString().slice(0, 10);

/** Chỉ nhận `YYYY-MM-DD` là ngày có thật; còn lại → `null`. */
export function parseDateParam(value: string | undefined): string | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const date = toUtc(value);
  return fromUtc(date) === value ? value : null;
}

const addDays = (iso: string, days: number): string => {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
};

/** Thứ Hai của tuần chứa ngày này (Chủ nhật thuộc tuần trước). */
export function weekStartOf(iso: string): string {
  const day = toUtc(iso).getUTCDay(); // 0 = Chủ nhật
  return addDays(iso, -((day + 6) % 7));
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function shiftWeek(weekStart: string, delta: number): string {
  return addDays(weekStart, delta * 7);
}

/** Ngày hôm nay (`YYYY-MM-DD`) theo múi giờ cho trước; múi giờ sai → UTC. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return fromUtc(now);
  }
}

/** Thứ Hai của tuần cần hiển thị: tham số hợp lệ và không quá xa → tuần chứa ngày đó; ngược lại tuần của hôm nay. */
export function resolveWeek(param: string | undefined, today: string): string {
  const parsed = parseDateParam(param);
  const fallback = weekStartOf(today);
  if (!parsed) return fallback;
  const yearsAway = Math.abs(Number(parsed.slice(0, 4)) - Number(today.slice(0, 4)));
  return yearsAway > MAX_YEARS_AWAY ? fallback : weekStartOf(parsed);
}

/** Đường dẫn trang Lịch đăng; chỉ ghi tham số có giá trị (tuần `w`, bài đang mở `post`, nền tảng `p`). */
export function calendarHref(params: { week?: string; post?: string; platform?: string }): string {
  const query: string[] = [];
  if (params.week) query.push(`w=${encodeURIComponent(params.week)}`);
  if (params.post) query.push(`post=${encodeURIComponent(params.post)}`);
  if (params.platform) query.push(`p=${encodeURIComponent(params.platform)}`);
  return query.length > 0 ? `/app/calendar?${query.join('&')}` : '/app/calendar';
}
