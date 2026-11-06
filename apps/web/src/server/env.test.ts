import { describe, expect, it } from 'vitest';
import { loadServerEnv, loadWebhookEnv } from './env';

const BASE = {
  APP_ENV: 'dev',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  BETTER_AUTH_URL: 'http://localhost:3000',
  DATABASE_AUTH_URL: 'postgresql://cf_auth:x@localhost:5432/db',
  DATABASE_URL: 'postgresql://cf_app:x@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  REDIS_KEY_PREFIX: 'dev:',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'CommentFlow AI <no-reply@example.test>',
};

describe('loadServerEnv — nguồn IP (ADR 004 §2)', () => {
  it('mặc định là none (không tin header nào)', () => {
    expect(loadServerEnv(BASE).CLIENT_IP_SOURCE).toBe('none');
  });

  it('REDIS_KEY_PREFIX bắt buộc khác rỗng ở dev/test/ci/staging (khóa luôn có tiền tố môi trường)', () => {
    for (const appEnv of ['dev', 'test', 'ci', 'staging']) {
      for (const prefix of [undefined, '', '   ']) {
        expect(
          () => loadServerEnv({ ...BASE, APP_ENV: appEnv, REDIS_KEY_PREFIX: prefix }),
          `${appEnv}/${JSON.stringify(prefix)}`,
        ).toThrow(/REDIS_KEY_PREFIX/);
      }
      expect(
        loadServerEnv({ ...BASE, APP_ENV: appEnv, REDIS_KEY_PREFIX: 'x:' }).REDIS_KEY_PREFIX,
      ).toBe('x:');
    }
  });

  it('production được để trống tiền tố (Valkey riêng)', () => {
    expect(
      loadServerEnv({ ...BASE, APP_ENV: 'production', REDIS_KEY_PREFIX: '' }).REDIS_KEY_PREFIX,
    ).toBe('');
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

describe('FR-020 loadWebhookEnv — cấu hình endpoint webhook', () => {
  const db = 'postgresql://cf_app:x@localhost:5432/db';

  it('FR-020 thiếu META_* → undefined (endpoint trả 503), không ném lỗi', () => {
    expect(loadWebhookEnv({ DATABASE_URL: db })).toEqual({
      databaseUrl: db,
      appSecret: undefined,
      verifyToken: undefined,
    });
    expect(
      loadWebhookEnv({ DATABASE_URL: db, META_APP_SECRET: '   ', META_WEBHOOK_VERIFY_TOKEN: '' }),
    ).toMatchObject({ appSecret: undefined, verifyToken: undefined });
  });

  it('FR-020 đọc META_* hợp lệ (cắt khoảng trắng đầu/cuối)', () => {
    const env = loadWebhookEnv({
      DATABASE_URL: db,
      META_APP_SECRET: ` ${'a'.repeat(32)} `,
      META_WEBHOOK_VERIFY_TOKEN: 'v'.repeat(20),
    });
    expect(env.appSecret).toBe('a'.repeat(32));
    expect(env.verifyToken).toBe('v'.repeat(20));
  });

  it('FR-020 khóa quá ngắn bị từ chối (tên biến, không lộ giá trị); thiếu DATABASE_URL → lỗi', () => {
    expect(() => loadWebhookEnv({ DATABASE_URL: db, META_APP_SECRET: 'ngan' })).toThrow(
      /META_APP_SECRET/,
    );
    expect(() => loadWebhookEnv({})).toThrow(/DATABASE_URL/);
  });
});
