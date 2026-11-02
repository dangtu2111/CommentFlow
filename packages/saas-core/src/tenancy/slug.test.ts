import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('bỏ dấu tiếng Việt, đ → d, chữ thường, nối bằng gạch ngang', () => {
    expect(slugify('Cửa hàng Đồ Chơi Bé Yêu')).toBe('cua-hang-do-choi-be-yeu');
  });

  it('bỏ ký tự đặc biệt và gạch ngang thừa ở hai đầu', () => {
    expect(slugify('  --Shop & Co.!!  ')).toBe('shop-co');
  });

  it('cắt tối đa 40 ký tự và không để gạch ngang ở cuối', () => {
    const slug = slugify(`${'a'.repeat(39)} bbbbbb`);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('tên chỉ có ký tự đặc biệt → dùng "workspace"', () => {
    expect(slugify('!!!')).toBe('workspace');
  });
});

describe('uniqueSlug', () => {
  it('thêm hậu tố ngẫu nhiên 6 ký tự hex để tránh trùng', () => {
    expect(uniqueSlug('Shop A', 'abc123')).toBe('shop-a-abc123');
    expect(uniqueSlug('Shop A')).toMatch(/^shop-a-[0-9a-f]{6}$/);
    expect(uniqueSlug('Shop A')).not.toBe(uniqueSlug('Shop A'));
  });
});
