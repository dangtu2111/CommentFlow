import { flattenMessages } from '@flow/shared';
import en from '@flow/shared/messages/en.json';
import vi from '@flow/shared/messages/vi.json';
import { describe, expect, it } from 'vitest';
import { reauthFailureToState } from './security-form';

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
