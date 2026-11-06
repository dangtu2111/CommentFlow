import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decideDelivery,
  isInQuietHours,
  nextQuietEnd,
  parseNotificationPrefs,
  type QuietHours,
} from './notification-prefs';

const quiet = (over: Partial<QuietHours> = {}): QuietHours => ({
  enabled: true,
  start: '22:00',
  end: '07:00',
  timezone: 'Asia/Ho_Chi_Minh',
  ...over,
});
// 15:00Z = 22:00 giờ VN (UTC+7)
const at = (iso: string) => new Date(iso);

describe('FR-084 lựa chọn thông báo', () => {
  it('đầu vào hỏng → mặc định: đẩy+email bật cho sự kiện khẩn, yên lặng tắt', () => {
    const p = parseNotificationPrefs('rác');
    expect(p.events.channel_error).toEqual({ push: true, email: true });
    expect(p.quietHours.enabled).toBe(false);
  });
  it('giữ lựa chọn hợp lệ, bỏ khóa lạ, khung giờ hỏng → tắt', () => {
    const p = parseNotificationPrefs({
      events: { needs_human: { push: false, email: true }, lạ: { push: true } },
      quietHours: { enabled: true, start: '25:99', end: '07:00', timezone: 'Asia/Ho_Chi_Minh' },
    });
    expect(p.events.needs_human).toEqual({ push: false, email: true });
    expect(p.quietHours.enabled).toBe(false);
  });
  it('múi giờ lạ → không bật giờ yên lặng', () => {
    const p = parseNotificationPrefs({
      quietHours: { enabled: true, start: '22:00', end: '07:00', timezone: 'Mars/X' },
    });
    expect(p.quietHours.enabled).toBe(false);
  });
});

describe('FR-084 giờ yên lặng', () => {
  it('khung qua đêm: 22:00 vào, 07:00 ra (biên)', () => {
    expect(isInQuietHours(at('2026-11-06T15:00:00Z'), quiet())).toBe(true); // 22:00
    expect(isInQuietHours(at('2026-11-06T14:59:00Z'), quiet())).toBe(false); // 21:59
    expect(isInQuietHours(at('2026-11-06T23:59:00Z'), quiet())).toBe(true); // 06:59
    expect(isInQuietHours(at('2026-11-07T00:00:00Z'), quiet())).toBe(false); // 07:00
  });
  it('khung trong ngày; tắt; start = end', () => {
    const q = quiet({ start: '12:00', end: '13:00' });
    expect(isInQuietHours(at('2026-11-06T05:30:00Z'), q)).toBe(true);
    expect(isInQuietHours(at('2026-11-06T06:00:00Z'), q)).toBe(false);
    expect(isInQuietHours(at('2026-11-06T15:00:00Z'), quiet({ enabled: false }))).toBe(false);
    expect(
      isInQuietHours(at('2026-11-06T15:00:00Z'), quiet({ start: '08:00', end: '08:00' })),
    ).toBe(false);
  });
  it('đúng múi giờ người dùng, không phải UTC', () => {
    const ny = quiet({ timezone: 'America/New_York' });
    expect(isInQuietHours(at('2026-11-06T15:00:00Z'), ny)).toBe(false); // 10:00 NY
    expect(isInQuietHours(at('2026-11-07T05:00:00Z'), ny)).toBe(true); // 00:00 NY (EST)
  });
  it('nextQuietEnd: mốc hết yên lặng; ngoài yên lặng → null', () => {
    expect(nextQuietEnd(at('2026-11-06T16:30:00Z'), quiet())?.toISOString()).toBe(
      '2026-11-07T00:00:00.000Z',
    );
    expect(nextQuietEnd(at('2026-11-06T10:00:00Z'), quiet())).toBeNull();
  });
  it('mốc hoãn luôn sau now, đã ra khỏi yên lặng, ≤ 24 giờ (property)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01'), noInvalidDate: true }),
        (d) => {
          const end = nextQuietEnd(d, quiet());
          if (!end) return !isInQuietHours(d, quiet());
          return (
            end.getTime() > d.getTime() &&
            !isInQuietHours(end, quiet()) &&
            end.getTime() - d.getTime() <= 24 * 3600_000
          );
        },
      ),
    );
  });
});

describe('FR-084 quyết định giao', () => {
  const prefs = parseNotificationPrefs({
    events: {
      needs_human: { push: true, email: false },
      channel_error: { push: true, email: true },
    },
    quietHours: quiet(),
    digestMinutes: 30,
  });
  const noon = at('2026-11-06T05:00:00Z'); // 12:00 VN
  const night = at('2026-11-06T16:00:00Z'); // 23:00 VN

  it('kênh tắt → bỏ qua', () => {
    const d = decideDelivery({ event: 'needs_human', prefs, now: noon });
    expect(d.find((x) => x.channel === 'email')?.action).toBe('skip');
  });
  it('ngoài yên lặng: khẩn gửi ngay, thường gom', () => {
    expect(
      decideDelivery({ event: 'channel_error', prefs, now: noon }).every(
        (x) => x.action === 'send',
      ),
    ).toBe(true);
    expect(
      decideDelivery({ event: 'needs_human', prefs, now: noon }).find((x) => x.channel === 'push')
        ?.action,
    ).toBe('batch');
  });
  it('trong yên lặng: thường hoãn tới hết giờ, khẩn đi ngay', () => {
    const normal = decideDelivery({ event: 'needs_human', prefs, now: night }).find(
      (x) => x.channel === 'push',
    );
    expect(normal).toMatchObject({ action: 'defer' });
    expect(normal?.until?.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(
      decideDelivery({ event: 'channel_error', prefs, now: night }).every(
        (x) => x.action === 'send',
      ),
    ).toBe(true);
  });
  it('digestMinutes = 0 → gửi lẻ', () => {
    const p = parseNotificationPrefs({
      events: { needs_human: { push: true, email: false } },
      digestMinutes: 0,
    });
    expect(
      decideDelivery({ event: 'needs_human', prefs: p, now: noon }).find(
        (x) => x.channel === 'push',
      )?.action,
    ).toBe('send');
  });
  it('sự kiện lạ → bỏ qua cả hai kênh', () => {
    expect(
      decideDelivery({ event: 'khong_co' as never, prefs, now: noon }).every(
        (x) => x.action === 'skip',
      ),
    ).toBe(true);
  });
});
