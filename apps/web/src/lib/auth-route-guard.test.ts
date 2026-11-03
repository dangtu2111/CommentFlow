import { describe, expect, it } from 'vitest';
import {
  isAllowedAuthRequest,
  RESET_PASSWORD_CALLBACK,
  VERIFY_EMAIL_CALLBACK,
} from './auth-route-guard';

const verifyQuery = (callback: string) =>
  new URLSearchParams({ token: 't', callbackURL: callback });

describe('isAllowedAuthRequest', () => {
  it('cho GET verify-email và GET reset-password/<token> khi callbackURL đúng đích cố định', () => {
    expect(
      isAllowedAuthRequest('GET', '/api/auth/verify-email', verifyQuery(VERIFY_EMAIL_CALLBACK)),
    ).toBe(true);
    expect(
      isAllowedAuthRequest(
        'GET',
        '/api/auth/reset-password/abc123.DEF_-~',
        new URLSearchParams({ callbackURL: RESET_PASSWORD_CALLBACK }),
      ),
    ).toBe(true);
  });

  it('chặn open redirect: callbackURL ngoài trang, //host, /\\host, scheme lạ, thiếu, hoặc sai đích', () => {
    for (const callback of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/login',
      '/verify-email?status=ok&x=https://evil.example',
      '/reset-password?next=//evil.example',
      '',
    ]) {
      expect(
        isAllowedAuthRequest('GET', '/api/auth/verify-email', verifyQuery(callback)),
        callback,
      ).toBe(false);
      expect(
        isAllowedAuthRequest(
          'GET',
          '/api/auth/reset-password/abc',
          new URLSearchParams({ callbackURL: callback }),
        ),
        callback,
      ).toBe(false);
    }
    expect(
      isAllowedAuthRequest('GET', '/api/auth/verify-email', new URLSearchParams({ token: 't' })),
    ).toBe(false);
    expect(isAllowedAuthRequest('GET', '/api/auth/reset-password/abc')).toBe(false);
  });

  it('đích của đường này không dùng được cho đường kia', () => {
    expect(
      isAllowedAuthRequest('GET', '/api/auth/verify-email', verifyQuery(RESET_PASSWORD_CALLBACK)),
    ).toBe(false);
    expect(
      isAllowedAuthRequest(
        'GET',
        '/api/auth/reset-password/abc',
        verifyQuery(VERIFY_EMAIL_CALLBACK),
      ),
    ).toBe(false);
  });

  it('chặn mọi đường đăng nhập/đăng ký/phiên khác của Better Auth', () => {
    const q = verifyQuery(VERIFY_EMAIL_CALLBACK);
    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-up/email',
      '/api/auth/get-session',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
      '/api/auth/sign-out',
      '/api/auth/send-verification-email',
      '/api/auth/',
      '/api/auth',
      '/api/auth/verify-email/extra',
      '/api/auth/reset-password/a/b',
      '/api/auth/reset-password/',
      '/api/auth/../auth/sign-in/email',
    ]) {
      expect(isAllowedAuthRequest('GET', path, q), path).toBe(false);
    }
  });

  it('chặn mọi phương thức khác GET, kể cả trên đường được phép', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      expect(
        isAllowedAuthRequest(method, '/api/auth/verify-email', verifyQuery(VERIFY_EMAIL_CALLBACK)),
        method,
      ).toBe(false);
      expect(
        isAllowedAuthRequest(
          method,
          '/api/auth/reset-password/abc',
          new URLSearchParams({ callbackURL: RESET_PASSWORD_CALLBACK }),
        ),
        method,
      ).toBe(false);
    }
  });

  it('token quá dài hoặc có ký tự lạ bị chặn', () => {
    const q = new URLSearchParams({ callbackURL: RESET_PASSWORD_CALLBACK });
    expect(isAllowedAuthRequest('GET', `/api/auth/reset-password/${'a'.repeat(513)}`, q)).toBe(
      false,
    );
    expect(isAllowedAuthRequest('GET', '/api/auth/reset-password/a%2Fb', q)).toBe(false);
    expect(isAllowedAuthRequest('GET', '/api/auth/reset-password/a b', q)).toBe(false);
  });
});
