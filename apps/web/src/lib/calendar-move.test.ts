import { describe, expect, it } from 'vitest';
import { isDay, moveToDay } from './calendar-move';

const ZONE = 'Asia/Ho_Chi_Minh';
const NOW = new Date('2026-11-13T03:00:00Z'); // 10:00 giờ VN

describe('moveToDay', () => {
  it('đổi ngày, GIỮ giờ địa phương của cửa hàng', () => {
    const current = new Date('2026-11-15T02:30:00Z'); // 09:30 VN ngày 15
    expect(moveToDay(current, '2026-11-18', ZONE, NOW)?.toISOString()).toBe(
      '2026-11-18T02:30:00.000Z',
    );
  });

  it('giữ đúng giờ địa phương khi múi giờ khác UTC (bài lúc 23:30 VN = 16:30Z ngày trước)', () => {
    const current = new Date('2026-11-15T16:30:00Z'); // 23:30 VN ngày 15
    expect(moveToDay(current, '2026-11-20', ZONE, NOW)?.toISOString()).toBe(
      '2026-11-20T16:30:00.000Z',
    );
  });

  it('ngày quá khứ, quá 90 ngày, hoặc giờ mới cách hiện tại dưới 2 phút → null', () => {
    const current = new Date('2026-11-15T02:30:00Z');
    expect(moveToDay(current, '2026-11-10', ZONE, NOW)).toBeNull();
    expect(moveToDay(current, '2027-03-01', ZONE, NOW)).toBeNull();
    const soon = new Date('2026-11-14T03:01:00Z'); // 10:01 VN
    expect(moveToDay(soon, '2026-11-13', ZONE, NOW)).toBeNull();
  });

  it('ngày đích sai định dạng → null', () => {
    const current = new Date('2026-11-15T02:30:00Z');
    for (const bad of ['', '2026-1-5', 'abc', '2026-11-18T00:00', '18/11/2026']) {
      expect(moveToDay(current, bad, ZONE, NOW), bad).toBeNull();
    }
    expect(isDay('2026-11-18')).toBe(true);
  });
});
