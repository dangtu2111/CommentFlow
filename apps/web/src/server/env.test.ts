import { describe, expect, it } from 'vitest';
import { loadServerEnv } from './env';

const BASE = {
  APP_ENV: 'dev',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  BETTER_AUTH_URL: 'http://localhost:3000',
  DATABASE_AUTH_URL: 'postgresql://cf_auth:x@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'CommentFlow AI <no-reply@example.test>',
};

describe('loadServerEnv — nguồn IP (ADR 004 §2)', () => {
  it('mặc định là none (không tin header nào) và REDIS_KEY_PREFIX mặc định rỗng', () => {
    const env = loadServerEnv(BASE);
    expect(env.CLIENT_IP_SOURCE).toBe('none');
    expect(env.REDIS_KEY_PREFIX).toBe('');
  });

  it('cf-connecting-ip chỉ được dùng khi APP_ENV=staging', () => {
    expect(
      loadServerEnv({ ...BASE, APP_ENV: 'staging', CLIENT_IP_SOURCE: 'cf-connecting-ip' })
        .CLIENT_IP_SOURCE,
    ).toBe('cf-connecting-ip');
    for (const appEnv of ['dev', 'test', 'ci', 'production']) {
      expect(
        () => loadServerEnv({ ...BASE, APP_ENV: appEnv, CLIENT_IP_SOURCE: 'cf-connecting-ip' }),
        appEnv,
      ).toThrow(/CLIENT_IP_SOURCE/);
    }
  });

  it('giá trị nguồn IP lạ (x-forwarded-for…) bị từ chối', () => {
    expect(() => loadServerEnv({ ...BASE, CLIENT_IP_SOURCE: 'x-forwarded-for' })).toThrow(
      /CLIENT_IP_SOURCE/,
    );
  });

  it('PWNED_CHECK mặc định on; off chỉ được ở dev/test/ci', () => {
    expect(loadServerEnv(BASE).PWNED_CHECK).toBe('on');
    expect(loadServerEnv({ ...BASE, PWNED_CHECK: 'off' }).PWNED_CHECK).toBe('off');
    for (const appEnv of ['staging', 'production']) {
      expect(() => loadServerEnv({ ...BASE, APP_ENV: appEnv, PWNED_CHECK: 'off' }), appEnv).toThrow(
        /PWNED_CHECK/,
      );
    }
  });

  it('thiếu REDIS_URL → lỗi nêu đúng tên biến (không in giá trị)', () => {
    const { REDIS_URL: _omit, ...withoutRedis } = BASE;
    expect(() => loadServerEnv(withoutRedis)).toThrow(/REDIS_URL/);
  });
});
