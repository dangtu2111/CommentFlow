import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isLocale, negotiateLocale, resolveLocale } from './locales';

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

describe('negotiateLocale', () => {
  it('cookie hợp lệ thắng header', () => {
    expect(negotiateLocale('vi', 'en-US,en;q=0.9')).toBe('vi');
    expect(negotiateLocale('en', 'vi')).toBe('en');
  });
  it('không có cookie → theo Accept-Language (ngôn ngữ ưu tiên cao nhất ta hỗ trợ)', () => {
    expect(negotiateLocale(undefined, 'en-US,en;q=0.9,vi;q=0.8')).toBe('en');
    expect(negotiateLocale(undefined, 'vi-VN,vi;q=0.9,en;q=0.8')).toBe('vi');
    expect(negotiateLocale(undefined, 'fr-FR,fr;q=0.9,en;q=0.8')).toBe('en');
    expect(negotiateLocale(undefined, 'en;q=0.5,vi;q=0.9')).toBe('vi');
  });
  it('cookie sai, header thiếu/lạ/hỏng → tiếng Việt', () => {
    expect(negotiateLocale('xx', null)).toBe('vi');
    expect(negotiateLocale(undefined, undefined)).toBe('vi');
    expect(negotiateLocale(undefined, 'fr,de;q=0.5')).toBe('vi');
    expect(negotiateLocale(undefined, 'en;q=abc')).toBe('vi');
    expect(negotiateLocale(undefined, 'en;q=0')).toBe('vi');
  });
});
