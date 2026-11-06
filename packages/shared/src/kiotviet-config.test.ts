import { describe, expect, it } from 'vitest';
import { readKiotVietConfig } from './kiotviet-config';

describe('FR-122 readKiotVietConfig', () => {
  it('mặc định TẮT', () => {
    expect(readKiotVietConfig({})).toEqual({ enabled: false });
    expect(readKiotVietConfig({ KIOTVIET_ENABLED: '' })).toEqual({ enabled: false });
  });
  it.each(['TRUE', '1', 'yes', 'True', ' true'])('chỉ đúng chữ true mới bật (%s → tắt)', (v) => {
    expect(readKiotVietConfig({ KIOTVIET_ENABLED: v }).enabled).toBe(false);
  });
  it('true → bật', () => {
    expect(readKiotVietConfig({ KIOTVIET_ENABLED: 'true' })).toEqual({ enabled: true });
  });
});
