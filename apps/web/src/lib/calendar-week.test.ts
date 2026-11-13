import { describe, expect, it } from 'vitest';
import {
  calendarHref,
  parseDateParam,
  resolveWeek,
  shiftWeek,
  todayIn,
  weekDays,
  weekStartOf,
} from './calendar-week';

describe('parseDateParam', () => {
  it('chỉ nhận YYYY-MM-DD là ngày có thật; còn lại → null', () => {
    expect(parseDateParam('2026-11-12')).toBe('2026-11-12');
    for (const bad of [
      undefined,
      '',
      '2026-13-01',
      '2026-02-30',
      '12/11/2026',
      '2026-11-12x',
      '2026-1-2',
      "2026-11-12'; DROP",
    ]) {
      expect(parseDateParam(bad as string | undefined), String(bad)).toBeNull();
    }
  });
});

describe('weekStartOf — tuần bắt đầu từ Thứ Hai (như thiết kế)', () => {
  it('thứ Năm 12/11/2026 → thứ Hai 09/11; chính thứ Hai giữ nguyên; Chủ nhật thuộc tuần trước', () => {
    expect(weekStartOf('2026-11-12')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16');
  });

  it('qua ranh giới tháng và năm', () => {
    expect(weekStartOf('2026-03-01')).toBe('2026-02-23');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });
});

describe('weekDays / shiftWeek', () => {
  it('7 ngày liên tiếp từ thứ Hai; qua tháng đúng', () => {
    expect(weekDays('2026-11-30')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ]);
  });

  it('chuyển tuần trước/sau và giữ thứ Hai; năm nhuận', () => {
    expect(shiftWeek('2026-11-09', 1)).toBe('2026-11-16');
    expect(shiftWeek('2026-11-09', -1)).toBe('2026-11-02');
    expect(shiftWeek('2028-02-28', 1)).toBe('2028-03-06');
    expect(weekDays('2028-02-28')[1]).toBe('2028-02-29');
  });
});

describe('todayIn — "hôm nay" theo múi giờ workspace', () => {
  it('cùng một thời điểm UTC, hai múi giờ cho hai ngày khác nhau', () => {
    const instant = new Date('2026-11-12T20:30:00Z');
    expect(todayIn('Asia/Ho_Chi_Minh', instant)).toBe('2026-11-13');
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-11-12');
  });

  it('múi giờ sai → rơi về UTC thay vì ném lỗi', () => {
    expect(todayIn('Khong/Ton_Tai', new Date('2026-11-12T20:30:00Z'))).toBe('2026-11-12');
  });
});

describe('resolveWeek', () => {
  const today = '2026-11-12';
  it('không có/sai tham số → tuần của hôm nay; có ngày hợp lệ → tuần chứa ngày đó', () => {
    expect(resolveWeek(undefined, today)).toBe('2026-11-09');
    expect(resolveWeek('rác', today)).toBe('2026-11-09');
    expect(resolveWeek('2026-12-25', today)).toBe('2026-12-21');
  });

  it('chặn khoảng ngày quá xa (±5 năm) để không dựng tuần vô nghĩa', () => {
    expect(resolveWeek('1999-01-01', today)).toBe('2026-11-09');
    expect(resolveWeek('2099-01-01', today)).toBe('2026-11-09');
  });
});

describe('calendarHref', () => {
  it('đường dẫn /app/calendar kèm tuần, bài đang mở và bộ lọc nền tảng; bỏ tham số trống', () => {
    expect(calendarHref({})).toBe('/app/calendar');
    expect(calendarHref({ week: '2026-11-09' })).toBe('/app/calendar?w=2026-11-09');
    expect(calendarHref({ week: '2026-11-09', post: 'abc', platform: 'facebook' })).toBe(
      '/app/calendar?w=2026-11-09&post=abc&p=facebook',
    );
  });

  it('mã hóa giá trị lạ để không phá URL', () => {
    expect(calendarHref({ post: 'a b&c' })).toBe('/app/calendar?post=a%20b%26c');
  });
});
