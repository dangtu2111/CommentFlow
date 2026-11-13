import { describe, expect, it } from 'vitest';
import { localDateTimeToUtc, utcToLocalParts } from './zoned-time';

describe('localDateTimeToUtc — ngày giờ ĐỊA PHƯƠNG của cửa hàng → thời điểm UTC', () => {
  it('Việt Nam (UTC+7, không giờ mùa hè): 19:30 ngày 28/11 = 12:30 UTC', () => {
    expect(localDateTimeToUtc('2026-11-28', '19:30', 'Asia/Ho_Chi_Minh')?.toISOString()).toBe(
      '2026-11-28T12:30:00.000Z',
    );
  });

  it('qua nửa đêm: 00:15 ngày 01/12 giờ VN là 17:15 UTC ngày 30/11', () => {
    expect(localDateTimeToUtc('2026-12-01', '00:15', 'Asia/Ho_Chi_Minh')?.toISOString()).toBe(
      '2026-11-30T17:15:00.000Z',
    );
  });

  it('múi giờ có giờ mùa hè: New York mùa đông UTC-5, mùa hè UTC-4', () => {
    expect(localDateTimeToUtc('2026-01-15', '09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    expect(localDateTimeToUtc('2026-07-15', '09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('đầu vào sai (ngày không có thật, giờ ngoài khoảng, định dạng lạ, múi giờ sai) → null', () => {
    for (const [d, t, z] of [
      ['2026-02-30', '10:00', 'UTC'],
      ['2026-11-28', '25:00', 'UTC'],
      ['2026-11-28', '10:60', 'UTC'],
      ['28/11/2026', '10:00', 'UTC'],
      ['2026-11-28', '10h00', 'UTC'],
      ['2026-11-28', '10:00', 'Khong/Ton_Tai'],
      ['', '', 'UTC'],
    ] as const) {
      expect(localDateTimeToUtc(d, t, z), `${d} ${t} ${z}`).toBeNull();
    }
  });

  it('khứ hồi: utcToLocalParts đảo ngược đúng', () => {
    const instant = new Date('2026-11-28T12:30:00.000Z');
    expect(utcToLocalParts(instant, 'Asia/Ho_Chi_Minh')).toEqual({
      date: '2026-11-28',
      time: '19:30',
    });
    expect(localDateTimeToUtc('2026-11-28', '19:30', 'Asia/Ho_Chi_Minh')?.getTime()).toBe(
      instant.getTime(),
    );
  });
});
