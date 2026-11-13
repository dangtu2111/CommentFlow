import { describe, expect, it } from 'vitest';
import { cn } from './cn';
import { cx } from './cx';

describe('cx — ghép class có điều kiện, KHÔNG gộp xung đột Tailwind', () => {
  it('bỏ giá trị rỗng/false/null/undefined, giữ thứ tự', () => {
    expect(cx('a', false, null, undefined, '', 'b', 0 > 1 && 'c', 'd')).toBe('a b d');
  });

  it('giữ cả cỡ chữ của Stitch (text-title-sm) lẫn màu chữ (text-primary) — chính chỗ cn()/tailwind-merge làm mất cỡ chữ', () => {
    expect(cx('font-title-sm text-title-sm', 'text-primary')).toBe(
      'font-title-sm text-title-sm text-primary',
    );
    // Chứng minh lý do tồn tại: cn() coi text-title-sm là màu và bỏ đi khi gặp text-primary.
    expect(cn('font-title-sm text-title-sm', 'text-primary')).not.toContain('text-title-sm');
  });
});
