import { describe, expect, it } from 'vitest';
import { readHaravanConfig } from './haravan-config';

describe('FR-122 readHaravanConfig', () => {
  it('mặc định TẮT', () => {
    expect(readHaravanConfig({})).toEqual({ enabled: false });
    expect(readHaravanConfig({ HARAVAN_ENABLED: '' })).toEqual({ enabled: false });
  });
  it.each(['TRUE', '1', 'yes', 'True', ' true'])('chỉ đúng chữ true mới bật (%s → tắt)', (v) => {
    expect(readHaravanConfig({ HARAVAN_ENABLED: v }).enabled).toBe(false);
  });
  it('true → bật', () => {
    expect(readHaravanConfig({ HARAVAN_ENABLED: 'true' })).toEqual({ enabled: true });
  });
});
