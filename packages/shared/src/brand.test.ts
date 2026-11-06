import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND, defaultMailFrom, loadBrandConfig } from './brand';
import { isAppError } from './errors';

describe('FR-125 cấu hình thương hiệu', () => {
  it('không đặt biến nào → dùng giá trị tạm, không có logo/domain', () => {
    const brand = loadBrandConfig({});
    expect(brand.name).toBe(DEFAULT_BRAND.name);
    expect(brand.logoUrl).toBeUndefined();
    expect(brand.domain).toBeUndefined();
    expect(brand.mailFrom).toBeUndefined();
  });

  it('đọc APP_NAME, APP_LOGO_URL, APP_DOMAIN, APP_EMAIL_FROM và cắt khoảng trắng', () => {
    const brand = loadBrandConfig({
      APP_NAME: '  Tên Mới  ',
      APP_LOGO_URL: '/brand/logo.svg',
      APP_DOMAIN: 'App.Example.com',
      APP_EMAIL_FROM: 'Tên Mới <no-reply@example.com>',
    });
    expect(brand).toEqual({
      name: 'Tên Mới',
      logoUrl: '/brand/logo.svg',
      domain: 'app.example.com',
      mailFrom: 'Tên Mới <no-reply@example.com>',
    });
  });

  it('giá trị rỗng coi như chưa đặt', () => {
    const brand = loadBrandConfig({ APP_NAME: '', APP_LOGO_URL: ' ', APP_DOMAIN: '' });
    expect(brand.name).toBe(DEFAULT_BRAND.name);
    expect(brand.logoUrl).toBeUndefined();
    expect(brand.domain).toBeUndefined();
  });

  it('logo chỉ nhận đường dẫn gốc hoặc http(s); domain phải là tên miền không kèm scheme/đường dẫn', () => {
    expect(() => loadBrandConfig({ APP_LOGO_URL: 'javascript:alert(1)' })).toThrow(/APP_LOGO_URL/);
    expect(() => loadBrandConfig({ APP_LOGO_URL: '//evil.test/x.png' })).toThrow(/APP_LOGO_URL/);
    expect(loadBrandConfig({ APP_LOGO_URL: 'https://cdn.example.com/l.png' }).logoUrl).toBe(
      'https://cdn.example.com/l.png',
    );
    expect(() => loadBrandConfig({ APP_DOMAIN: 'https://a.com' })).toThrow(/APP_DOMAIN/);
    expect(() => loadBrandConfig({ APP_DOMAIN: 'a.com/path' })).toThrow(/APP_DOMAIN/);
  });

  it('tên quá dài hoặc có ký tự điều khiển bị từ chối, lỗi chỉ nêu tên biến', () => {
    try {
      loadBrandConfig({ APP_NAME: 'x'.repeat(61) });
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
      expect((error as Error).message).toContain('APP_NAME');
    }
    expect(() => loadBrandConfig({ APP_NAME: 'a\nb' })).toThrow(/APP_NAME/);
  });

  it('defaultMailFrom: ưu tiên APP_EMAIL_FROM, rồi tên + domain, rồi không có', () => {
    const base = loadBrandConfig({ APP_NAME: 'Tên Mới', APP_DOMAIN: 'example.com' });
    expect(defaultMailFrom(base)).toBe('Tên Mới <no-reply@example.com>');
    expect(defaultMailFrom({ ...base, mailFrom: 'X <x@y.test>' })).toBe('X <x@y.test>');
    expect(defaultMailFrom(loadBrandConfig({}))).toBeUndefined();
  });
});
