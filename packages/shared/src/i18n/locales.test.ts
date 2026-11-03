import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isLocale, resolveLocale } from './locales';

describe('locales', () => {
  it('isLocale chỉ nhận vi và en', () => {
    expect(isLocale('vi')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('resolveLocale dùng giá trị cookie hợp lệ', () => {
    expect(resolveLocale('en')).toBe('en');
  });

  it('resolveLocale quay về tiếng Việt khi thiếu hoặc sai cookie', () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('xx')).toBe('vi');
  });
});
