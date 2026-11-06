import { describe, expect, it } from 'vitest';
import { modeTone } from './automation-ui';

describe('modeTone', () => {
  it('ánh xạ từng mức tự gửi sang tông viên', () => {
    expect(modeTone('auto')).toBe('auto');
    expect(modeTone('shadow')).toBe('shadow');
    expect(modeTone('off')).toBe('off');
  });

  it('giá trị lạ → tông "off" (an toàn)', () => {
    expect(modeTone('xyz')).toBe('off');
    expect(modeTone(undefined)).toBe('off');
  });
});
