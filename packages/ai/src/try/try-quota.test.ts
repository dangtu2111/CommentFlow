import { describe, expect, it } from 'vitest';
import { createTryQuota, DEFAULT_TRY_DAILY_LIMIT } from './try-quota';

describe('BR-03 giới hạn lượt Thử AI mỗi ngày (không trừ lượt gói)', () => {
  const day1 = new Date('2026-11-06T10:00:00Z');
  const day2 = new Date('2026-11-07T10:00:00Z');

  it('cho tới đúng giới hạn rồi chặn; không ghi nhận lượt bị chặn', () => {
    const q = createTryQuota({ limit: 2 });
    expect(q.take('ws1', day1)).toEqual({ ok: true, used: 1, limit: 2 });
    expect(q.take('ws1', day1)).toEqual({ ok: true, used: 2, limit: 2 });
    expect(q.take('ws1', day1)).toEqual({ ok: false, used: 2, limit: 2 });
    expect(q.take('ws1', day1).used).toBe(2);
  });

  it('khóa theo workspace và theo ngày', () => {
    const q = createTryQuota({ limit: 1 });
    expect(q.take('ws1', day1).ok).toBe(true);
    expect(q.take('ws2', day1).ok).toBe(true);
    expect(q.take('ws1', day1).ok).toBe(false);
    expect(q.take('ws1', day2).ok).toBe(true);
  });

  it('giới hạn mặc định dương; limit không hợp lệ → dùng mặc định', () => {
    expect(DEFAULT_TRY_DAILY_LIMIT).toBeGreaterThan(0);
    const q = createTryQuota({ limit: -3 });
    expect(q.take('ws1', day1).limit).toBe(DEFAULT_TRY_DAILY_LIMIT);
  });

  it('khi nhiều ngày qua, dọn khóa cũ (không phình bộ nhớ)', () => {
    const q = createTryQuota({ limit: 1 });
    q.take('ws1', day1);
    q.take('ws1', day2);
    expect(q.size()).toBe(1);
  });
});
