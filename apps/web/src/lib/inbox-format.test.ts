import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime } from './inbox-format';

const now = new Date('2026-11-05T10:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('FR-040 formatRelativeTime — thời gian tương đối theo ngôn ngữ giao diện', () => {
  it('FR-040 tiếng Việt: giây/phút/giờ/ngày', () => {
    expect(formatRelativeTime(ago(10), now, 'vi')).toBe('bây giờ');
    expect(formatRelativeTime(ago(5 * 60), now, 'vi')).toBe('5 phút trước');
    expect(formatRelativeTime(ago(3 * 3600), now, 'vi')).toBe('3 giờ trước');
    expect(formatRelativeTime(ago(2 * 86400), now, 'vi')).toBe('Hôm kia');
    expect(formatRelativeTime(ago(3 * 86400), now, 'vi')).toBe('3 ngày trước');
  });

  it('FR-040 tiếng Anh', () => {
    expect(formatRelativeTime(ago(5 * 60), now, 'en')).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(3 * 3600), now, 'en')).toBe('3 hours ago');
    expect(formatRelativeTime(ago(2 * 86400), now, 'en')).toBe('2 days ago');
  });

  it('FR-040 từ 30 ngày trở lên: hiện ngày; thời điểm ở tương lai (lệch đồng hồ) coi như bây giờ', () => {
    expect(formatRelativeTime(ago(40 * 86400), now, 'en')).toMatch(/2026|Sep|Oct/);
    expect(formatRelativeTime(new Date(now.getTime() + 60_000), now, 'vi')).toBe('bây giờ');
  });

  it('FR-040 thiếu thời gian → chuỗi rỗng; ngày không hợp lệ → chuỗi rỗng (không ném lỗi)', () => {
    expect(formatRelativeTime(null, now, 'vi')).toBe('');
    expect(formatRelativeTime(new Date('khong-hop-le'), now, 'vi')).toBe('');
  });
});

describe('FR-040 formatAbsoluteTime', () => {
  it('FR-040 định dạng đầy đủ theo ngôn ngữ và múi giờ workspace', () => {
    const d = new Date('2026-11-05T03:07:00Z');
    expect(formatAbsoluteTime(d, 'vi', 'Asia/Ho_Chi_Minh')).toContain('10:07');
    expect(formatAbsoluteTime(d, 'en', 'UTC')).toContain('3:07');
    expect(formatAbsoluteTime(null, 'vi', 'UTC')).toBe('');
  });
});
