/**
 * Đổi giữa "ngày + giờ ĐỊA PHƯƠNG của cửa hàng" và thời điểm UTC (COMPOSER: chọn giờ đăng theo múi giờ workspace). THUẦN, dùng `Intl` nên đúng cả với múi giờ có giờ mùa hè.
 * Sai định dạng/ngày không có thật/múi giờ sai → `null` (không đoán).
 */
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return (
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) -
    Math.floor(instant / 1000) * 1000
  );
}

export function localDateTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = DATE.exec(date);
  const t = TIME.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (hour > 23 || minute > 59) return null;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(asUtc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    return null;
  try {
    // Hai lần xấp xỉ: giờ lệch có thể đổi quanh thời điểm chuyển giờ mùa hè.
    let guess = asUtc - offsetMs(asUtc, timeZone);
    guess = asUtc - offsetMs(guess, timeZone);
    return new Date(guess);
  } catch {
    return null;
  }
}

/** Ngày `YYYY-MM-DD` và giờ `HH:MM` ĐỊA PHƯƠNG của một thời điểm (để điền lại biểu mẫu khi sửa bài). */
export function utcToLocalParts(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
