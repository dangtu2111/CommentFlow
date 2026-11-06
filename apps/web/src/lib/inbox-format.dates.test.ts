import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime, toDate, toIsoString } from './inbox-format';

describe('ngày giờ qua ranh giới JSON (chuỗi/số thay vì Date)', () => {
  const iso = '2026-11-05T03:24:00.000Z';

  it('toDate nhận Date, chuỗi ISO, số mili-giây; rỗng/không hợp lệ → null', () => {
    expect(toDate(new Date(iso))?.toISOString()).toBe(iso);
    expect(toDate(iso)?.toISOString()).toBe(iso);
    expect(toDate(Date.parse(iso))?.toISOString()).toBe(iso);
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('không phải ngày')).toBeNull();
  });

  it('toIsoString không ném lỗi với chuỗi (lỗi "toISOString is not a function")', () => {
    expect(toIsoString(iso)).toBe(iso);
    expect(toIsoString(null)).toBeUndefined();
  });

  it('formatRelativeTime/formatAbsoluteTime chịu được chuỗi ISO', () => {
    const now = new Date('2026-11-05T03:34:00.000Z');
    expect(formatRelativeTime(iso, now, 'vi')).not.toBe('');
    expect(formatAbsoluteTime(iso, 'vi', 'Asia/Ho_Chi_Minh')).not.toBe('');
    expect(formatRelativeTime('xx', now, 'vi')).toBe('');
  });
});
