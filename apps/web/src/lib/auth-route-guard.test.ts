import { describe, expect, it } from 'vitest';
import { isAllowedAuthRequest } from './auth-route-guard';

describe('isAllowedAuthRequest', () => {
  it('cho GET verify-email và GET reset-password/<token>', () => {
    expect(isAllowedAuthRequest('GET', '/api/auth/verify-email')).toBe(true);
    expect(isAllowedAuthRequest('GET', '/api/auth/reset-password/abc123.DEF_-~')).toBe(true);
  });

  it('chặn mọi đường đăng nhập/đăng ký/phiên khác của Better Auth', () => {
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
      expect(isAllowedAuthRequest('GET', path), path).toBe(false);
    }
  });

  it('chặn mọi phương thức khác GET, kể cả trên đường được phép', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      expect(isAllowedAuthRequest(method, '/api/auth/verify-email'), method).toBe(false);
      expect(isAllowedAuthRequest(method, '/api/auth/reset-password/abc'), method).toBe(false);
    }
  });

  it('token quá dài hoặc có ký tự lạ bị chặn', () => {
    expect(isAllowedAuthRequest('GET', `/api/auth/reset-password/${'a'.repeat(513)}`)).toBe(false);
    expect(isAllowedAuthRequest('GET', '/api/auth/reset-password/a%2Fb')).toBe(false);
    expect(isAllowedAuthRequest('GET', '/api/auth/reset-password/a b')).toBe(false);
  });
});
