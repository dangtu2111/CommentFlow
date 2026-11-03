import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_ZONE, isValidTimeZone, WORKSPACE_TIME_ZONES } from './tenancy';

describe('múi giờ workspace', () => {
  it('mọi múi giờ trong danh sách đều được môi trường chạy hiểu', () => {
    for (const zone of WORKSPACE_TIME_ZONES)
      expect(() => new Intl.DateTimeFormat('en', { timeZone: zone })).not.toThrow();
  });
  it('mặc định nằm trong danh sách; biến thể chữ hoa/thường hay rác bị từ chối', () => {
    expect(isValidTimeZone(DEFAULT_TIME_ZONE)).toBe(true);
    for (const bad of ['asia/ho_chi_minh', 'Mars/Olympus', '', '+07:00', 'UTC '])
      expect(isValidTimeZone(bad)).toBe(false);
  });
});
