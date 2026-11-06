import { describe, expect, it } from 'vitest';
import { loadSendRateConfig } from './send-rate-config';
import { DEFAULT_SEND_RATE_LIMITS } from './send-rate-limit';

describe('FR-114 loadSendRateConfig', () => {
  it('cờ tắt mặc định; chỉ đúng chữ `true` mới bật', () => {
    expect(loadSendRateConfig({}).enabled).toBe(false);
    for (const v of ['TRUE', '1', 'yes', ' true', '']) {
      expect(loadSendRateConfig({ SEND_RATE_LIMIT_ENABLED: v }).enabled).toBe(false);
    }
    expect(loadSendRateConfig({ SEND_RATE_LIMIT_ENABLED: 'true' }).enabled).toBe(true);
  });
  it('mặc định = docs/09 §11.1', () => {
    expect(loadSendRateConfig({}).limits).toEqual(DEFAULT_SEND_RATE_LIMITS);
    expect(DEFAULT_SEND_RATE_LIMITS).toEqual({
      pagePerMinute: 30,
      pagePerHour: 600,
      autoPerHour: 60,
      postPer10Min: 20,
      repeatPerHour: 5,
    });
  });
  it('ghi đè bằng số nguyên dương; số lạ/0/âm/thập phân → mặc định', () => {
    const c = loadSendRateConfig({
      SEND_RATE_PAGE_PER_MINUTE: '10',
      SEND_RATE_AUTO_PER_HOUR: '0',
      SEND_RATE_POST_PER_10MIN: 'abc',
      SEND_RATE_REPEAT_PER_HOUR: '2.5',
      SEND_RATE_PAGE_PER_HOUR: '-3',
    });
    expect(c.limits).toEqual({ ...DEFAULT_SEND_RATE_LIMITS, pagePerMinute: 10 });
  });
});
