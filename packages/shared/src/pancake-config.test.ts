import { describe, expect, it } from 'vitest';
import { readPancakeConfig } from './pancake-config';

describe('FR-122 readPancakeConfig', () => {
  it('mặc định tắt', () => {
    expect(readPancakeConfig({})).toEqual({ enabled: false });
  });
  it.each(['', 'TRUE', '1', 'yes', ' true'])('giá trị %j vẫn tắt', (value) => {
    expect(readPancakeConfig({ PANCAKE_ENABLED: value }).enabled).toBe(false);
  });
  it('chỉ đúng chữ `true` mới bật', () => {
    expect(readPancakeConfig({ PANCAKE_ENABLED: 'true' }).enabled).toBe(true);
  });
});
