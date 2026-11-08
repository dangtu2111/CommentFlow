import { describe, expect, it } from 'vitest';
import { parseSwitchArgs } from './kb-switch-embedding-args';

describe('kb:switch-embedding — tham số', () => {
  it('model là tham số bắt buộc; --status không cần model', () => {
    expect(parseSwitchArgs(['--', 'bge-m3'])).toEqual({ action: 'switch', model: 'bge-m3' });
    expect(parseSwitchArgs(['bge-m3-v2'])).toEqual({ action: 'switch', model: 'bge-m3-v2' });
    expect(parseSwitchArgs(['--status'])).toEqual({ action: 'status' });
  });

  it('thiếu model, thừa tham số, hoặc model lạ (khoảng trắng, ký tự đặc biệt) → lỗi cách dùng', () => {
    for (const bad of [[], ['a', 'b'], ['bge m3'], ['$(x)'], ['-x'], ['--status', 'x']]) {
      expect(() => parseSwitchArgs(bad)).toThrow(/Cách dùng/);
    }
  });
});
