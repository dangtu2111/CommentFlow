import { flattenMessages } from '@flow/shared';
import en from '@flow/shared/messages/en.json';
import vi from '@flow/shared/messages/vi.json';
import { describe, expect, it } from 'vitest';
import { parseSecurityInput, reauthFailureToState } from './security-form';

describe('reauthFailureToState', () => {
  it('đổi từng kết quả thất bại thành đúng khóa thông báo', () => {
    expect(reauthFailureToState({ status: 'wrong_password' })).toEqual({
      status: 'error',
      message: 'wrongPassword',
    });
    expect(reauthFailureToState({ status: 'invalid_code' })).toEqual({
      status: 'error',
      message: 'invalidCode',
    });
    expect(reauthFailureToState({ status: 'required' })).toEqual({
      status: 'error',
      message: 'twoFactorRequiredNoDisable',
    });
    expect(reauthFailureToState({ status: 'rate_limited', retryAfterSeconds: 61 })).toEqual({
      status: 'error',
      message: 'rateLimited',
      retryMinutes: 2,
    });
    expect(reauthFailureToState({ status: 'rate_limited', retryAfterSeconds: 5 })).toMatchObject({
      retryMinutes: 1,
    });
    expect(reauthFailureToState({ status: 'unauthenticated' })).toMatchObject({
      message: 'generic',
    });
  });
});

describe('parseSecurityInput (Zod ở ranh giới Server Action)', () => {
  const form = (entries: Record<string, string | undefined>): FormData => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      if (value !== undefined) data.set(key, value);
    }
    return data;
  };

  it('mật khẩu: bắt buộc, tối đa 128 ký tự; sai → wrongPassword', () => {
    expect(parseSecurityInput('password', form({ password: 'abc' }))).toEqual({
      ok: true,
      value: 'abc',
    });
    for (const bad of [{}, { password: '' }, { password: 'x'.repeat(129) }]) {
      expect(parseSecurityInput('password', form(bad))).toEqual({
        ok: false,
        state: { status: 'error', message: 'wrongPassword' },
      });
    }
  });

  it('mã xác nhận: bắt buộc, tối đa 64 ký tự; sai → invalidCode', () => {
    expect(parseSecurityInput('code', form({ code: '123 456' }))).toEqual({
      ok: true,
      value: '123 456',
    });
    for (const bad of [{}, { code: '' }, { code: '1'.repeat(65) }]) {
      expect(parseSecurityInput('code', form(bad))).toMatchObject({
        ok: false,
        state: { message: 'invalidCode' },
      });
    }
  });

  it('sessionId: phải là uuid', () => {
    const id = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
    expect(parseSecurityInput('sessionId', form({ sessionId: id }))).toEqual({
      ok: true,
      value: id,
    });
    for (const bad of [{}, { sessionId: '' }, { sessionId: 'abc' }, { sessionId: `${id}x` }]) {
      expect(parseSecurityInput('sessionId', form(bad)).ok).toBe(false);
    }
  });
});

describe('chuỗi trang bảo mật', () => {
  it('vi.json và en.json có cùng bộ khóa ở auth.twoFactor và auth.security', () => {
    const keys = (messages: typeof vi) =>
      Object.keys(
        flattenMessages({ a: messages.auth.twoFactor, b: messages.auth.security }),
      ).sort();
    expect(keys(en)).toEqual(keys(vi));
  });

  it('mọi khóa trình duyệt/hệ điều hành mà saas-core có thể trả đều có chuỗi', () => {
    for (const messages of [vi, en]) {
      for (const browser of ['edge', 'opera', 'firefox', 'chrome', 'safari', 'other']) {
        expect(messages.auth.security.sessions.browser).toHaveProperty(browser);
      }
      for (const os of ['windows', 'macos', 'ios', 'android', 'chromeos', 'linux', 'other']) {
        expect(messages.auth.security.sessions.os).toHaveProperty(os);
      }
    }
  });

  it('không hứa về vị trí hay địa chỉ IP của thiết bị (chỉ có trình duyệt, hệ điều hành, lần dùng gần nhất)', () => {
    for (const messages of [vi, en]) {
      const text = JSON.stringify(messages.auth.security.sessions);
      expect(text).not.toMatch(/IP|vị trí|location/i);
    }
  });
});
