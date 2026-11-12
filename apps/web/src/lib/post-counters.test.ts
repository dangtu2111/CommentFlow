import { describe, expect, it } from 'vitest';
import {
  COMPOSER_PLATFORMS,
  counterOf,
  countPostChars,
  PLATFORM_CHAR_LIMITS,
} from './post-counters';

describe('countPostChars', () => {
  it('đếm theo ký tự người dùng thấy: tiếng Việt có dấu và emoji (cả emoji ghép) tính 1', () => {
    expect(countPostChars('')).toBe(0);
    expect(countPostChars('Áo thun')).toBe(7);
    expect(countPostChars('✨')).toBe(1);
    expect(countPostChars('👍🏽')).toBe(1);
    expect(countPostChars('👨‍👩‍👧')).toBe(1);
  });

  it('chuẩn hóa dấu tổ hợp: "á" gõ rời (a + dấu sắc) vẫn tính 1', () => {
    expect(countPostChars('á')).toBe(1);
  });
});

describe('giới hạn theo nền tảng (số trong thiết kế Stitch composer)', () => {
  it('Facebook 63.206, Instagram 2.200, TikTok 2.200', () => {
    expect(PLATFORM_CHAR_LIMITS).toEqual({ facebook: 63206, instagram: 2200, tiktok: 2200 });
    expect(COMPOSER_PLATFORMS).toEqual(['facebook', 'instagram', 'tiktok']);
  });
});

describe('counterOf', () => {
  it('trả số đã dùng, giới hạn, còn lại và tỉ lệ; chưa vượt thì over=false', () => {
    expect(counterOf('abc', 'instagram')).toEqual({
      count: 3,
      limit: 2200,
      remaining: 2197,
      over: false,
      ratio: 3 / 2200,
    });
  });

  it('đúng giới hạn vẫn hợp lệ; vượt 1 ký tự thì over=true và remaining âm', () => {
    expect(counterOf('a'.repeat(2200), 'instagram').over).toBe(false);
    const over = counterOf('a'.repeat(2201), 'instagram');
    expect(over.over).toBe(true);
    expect(over.remaining).toBe(-1);
    expect(counterOf('a'.repeat(2201), 'facebook').over).toBe(false);
  });
});
