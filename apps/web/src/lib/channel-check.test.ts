import { describe, expect, it } from 'vitest';
import { CHECK_COOLDOWN_SECONDS, isCheckThrottled } from './channel-check';

const NOW = new Date('2026-11-07T10:00:00Z');
const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000);

describe('isCheckThrottled', () => {
  it('chưa kiểm lần nào → không chặn', () => {
    expect(isCheckThrottled([{ lastCheckedAt: null }], NOW)).toBe(false);
    expect(isCheckThrottled([], NOW)).toBe(false);
  });

  it('kiểm gần đây (trong thời gian chờ) → chặn, tính theo lần kiểm MỚI NHẤT của mọi kênh', () => {
    expect(isCheckThrottled([{ lastCheckedAt: at(5) }, { lastCheckedAt: at(500) }], NOW)).toBe(
      true,
    );
  });

  it('quá thời gian chờ → cho phép', () => {
    expect(isCheckThrottled([{ lastCheckedAt: at(CHECK_COOLDOWN_SECONDS + 1) }], NOW)).toBe(false);
  });
});
