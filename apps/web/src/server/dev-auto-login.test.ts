import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  type DevAutoLoginInput,
  decideDevAutoLogin,
  isProxiedRequest,
  safeNextPath,
  signSessionCookieValue,
} from './dev-auto-login';

const OK: DevAutoLoginInput = {
  nodeEnv: 'development',
  appEnv: 'dev',
  databaseUrl: 'postgres://cf_app:x@127.0.0.1:5432/cf_dev',
  databaseAuthUrl: 'postgres://cf_auth:x@127.0.0.1:5432/cf_dev',
  flag: '1',
  host: 'localhost:3000',
  forwarded: false,
  next: null,
};

describe('decideDevAutoLogin', () => {
  it('đủ ba khóa + loopback → cho phép, mặc định về /app/settings', () => {
    expect(decideDevAutoLogin(OK)).toEqual({ allowed: true, next: '/app/settings' });
  });

  it.each([
    ['production', { nodeEnv: 'production' }],
    ['nodeEnv trống', { nodeEnv: undefined }],
    ['APP_ENV staging', { appEnv: 'staging' }],
    ['APP_ENV production', { appEnv: 'production' }],
    ['APP_ENV test', { appEnv: 'test' }],
    ['APP_ENV thiếu', { appEnv: undefined }],
    ['cờ thiếu', { flag: undefined }],
    ['cờ true', { flag: 'true' }],
    ['cờ 0', { flag: '0' }],
    ['DB cf_test', { databaseUrl: 'postgres://u:x@127.0.0.1/cf_test' }],
    ['DB auth cf_ci', { databaseAuthUrl: 'postgres://u:x@127.0.0.1/cf_ci' }],
    ['DB staging', { databaseUrl: 'postgres://u:x@db.example.com/cf_staging' }],
    ['URL thiếu', { databaseUrl: undefined }],
    ['URL hỏng', { databaseUrl: 'không-phải-url' }],
    ['URL có tham số', { databaseUrl: 'postgres://u:x@127.0.0.1/cf_dev?host=evil' }],
    ['host lạ', { host: 'cf.example.com' }],
    ['host giả hậu tố', { host: 'localhost.evil.com' }],
    ['host thiếu', { host: null }],
    ['host có @', { host: 'localhost:3000@evil.com' }],
    ['host cổng chữ', { host: 'localhost:abc' }],
    ['qua proxy', { forwarded: true }],
  ] as [string, Partial<DevAutoLoginInput>][])('từ chối khi %s', (_name, patch) => {
    expect(decideDevAutoLogin({ ...OK, ...patch })).toEqual({ allowed: false });
  });

  it.each(['localhost', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST:3000'])(
    'nhận host loopback %s',
    (host) => {
      expect(decideDevAutoLogin({ ...OK, host }).allowed).toBe(true);
    },
  );

  it('next hợp lệ được giữ; next ngoài /app bị thay bằng mặc định', () => {
    expect(decideDevAutoLogin({ ...OK, next: '/app/inbox?x=1' })).toEqual({
      allowed: true,
      next: '/app/inbox?x=1',
    });
    expect(decideDevAutoLogin({ ...OK, next: 'https://evil.com' })).toMatchObject({
      next: '/app/settings',
    });
  });
});

describe('safeNextPath (chống open redirect)', () => {
  it.each([
    null,
    '',
    '/',
    '/login',
    '/application',
    '//evil.com',
    '/app//evil.com',
    '/app/\\evil.com',
    '\\app',
    'app/inbox',
    'http://evil.com/app',
    'javascript:alert(1)',
    '/app\r\nLocation: x',
    '/app/%0d%0a',
    `/app/${'a'.repeat(300)}`,
  ])('từ chối %j', (value) => {
    expect(safeNextPath(value)).toBe('/app/settings');
  });

  it.each(['/app', '/app/inbox', '/app/kb?tab=1', '/app/settings#x'])('nhận %s', (value) => {
    expect(safeNextPath(value)).toBe(value);
  });
});

describe('signSessionCookieValue', () => {
  it('đúng định dạng cookie ký của Better Auth: token.chữ-ký-HMAC-SHA256-base64, mã hóa URL', () => {
    const secret = 'bí-mật-0123456789012345678901234567';
    const value = signSessionCookieValue('tok123', secret);
    const sig = createHmac('sha256', secret).update('tok123').digest('base64');
    expect(value).toBe(encodeURIComponent(`tok123.${sig}`));
  });
});

describe('isProxiedRequest', () => {
  it('Next tự đặt x-forwarded-for loopback → không phải proxy', () => {
    expect(isProxiedRequest({ forwarded: null, xForwardedFor: null })).toBe(false);
    expect(isProxiedRequest({ forwarded: null, xForwardedFor: '::1' })).toBe(false);
    expect(isProxiedRequest({ forwarded: null, xForwardedFor: '::ffff:127.0.0.1' })).toBe(false);
  });
  it('địa chỉ ngoài loopback hoặc header forwarded → proxy', () => {
    expect(isProxiedRequest({ forwarded: null, xForwardedFor: '203.0.113.5' })).toBe(true);
    expect(isProxiedRequest({ forwarded: null, xForwardedFor: '127.0.0.1, 10.0.0.2' })).toBe(true);
    expect(isProxiedRequest({ forwarded: 'for=1.2.3.4', xForwardedFor: null })).toBe(true);
  });
});
