import { describe, expect, it } from 'vitest';
import { interpolate, LOCALES, message } from './i18n';

describe('i18n của E2E', () => {
  it('đọc cùng khóa ở cả hai ngôn ngữ và hai bản khác nhau', () => {
    const [vi, en] = LOCALES.map((locale) => message(locale, 'auth.register.submit'));
    expect(vi).toBeTruthy();
    expect(en).toBeTruthy();
    expect(vi).not.toBe(en);
  });

  it('thay tham số và báo lỗi khi thiếu', () => {
    expect(message('en', 'auth.app.greeting', { name: 'An' })).toBe('Hello, An');
    expect(() => message('en', 'auth.app.greeting')).toThrow(/name/);
    expect(interpolate('a {x} b {x}', { x: 1 })).toBe('a 1 b 1');
  });

  it('khóa không tồn tại hoặc trỏ tới nhóm thì báo lỗi', () => {
    expect(() => message('vi', 'auth.khong.co')).toThrow();
    expect(() => message('vi', 'auth.register')).toThrow();
  });
});
