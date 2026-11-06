import { describe, expect, it } from 'vitest';
import { readSapoConfig } from './sapo-config';

describe('FR-122 readSapoConfig', () => {
  it('mặc định TẮT', () => {
    expect(readSapoConfig({})).toEqual({ enabled: false });
    expect(readSapoConfig({ SAPO_ENABLED: '' })).toEqual({ enabled: false });
  });
  it.each(['TRUE', '1', 'yes', 'True', ' true'])('chỉ đúng chữ true mới bật (%s → tắt)', (v) => {
    expect(readSapoConfig({ SAPO_ENABLED: v }).enabled).toBe(false);
  });
  it('true → bật', () => {
    expect(readSapoConfig({ SAPO_ENABLED: 'true' })).toEqual({ enabled: true });
  });
});
