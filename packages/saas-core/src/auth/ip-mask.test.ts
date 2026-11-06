import { describe, expect, it } from 'vitest';
import { maskIp } from './ip-mask';

describe('maskIp', () => {
  it.each([
    ['113.161.22.9', '113.161.x.x'],
    ['  10.0.0.1 ', '10.0.x.x'],
    ['::ffff:203.0.113.7', '203.0.x.x'],
    ['2001:db8:85a3::8a2e:370:7334', '2001:db8:x:x:x:x:x:x'],
    ['[2001:db8::1]', '2001:db8:x:x:x:x:x:x'],
  ])('%s → %s', (input, expected) => {
    expect(maskIp(input)).toBe(expected);
  });

  it('idempotent: IP đã che giữ nguyên', () => {
    expect(maskIp('113.161.x.x')).toBe('113.161.x.x');
    expect(maskIp('2001:db8:x:x:x:x:x:x')).toBe('2001:db8:x:x:x:x:x:x');
  });

  it.each([null, undefined, '', 'unknown', 'abc.def', '999.1.1.1', '1.2.3'])(
    'giá trị không phải IP (%j) → null (không lộ chuỗi lạ)',
    (input) => {
      expect(maskIp(input)).toBeNull();
    },
  );
});
