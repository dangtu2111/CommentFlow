import { describe, expect, it } from 'vitest';
import { buildE2eEnv, databaseNameOf, REQUIRED_VARS, testDatabaseUrl } from './e2e-env.mjs';

const base = {
  TEST_DATABASE_URL: 'postgresql://cf_app:pw@10.0.0.1:5433/cf_test',
  TEST_DATABASE_ADMIN_URL: 'postgresql://cf_owner:pw@10.0.0.1:5433/cf_test',
  TEST_DATABASE_AUTH_URL: 'postgresql://cf_auth:pw@10.0.0.1:5433/cf_test',
  DATABASE_URL: 'postgresql://cf_app:pw@10.0.0.1:5433/cf_dev',
  REDIS_URL: 'redis://:pw@10.0.0.1:6380/0',
  REDIS_KEY_PREFIX: 'dev:',
  SMTP_HOST: '10.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'CF <no-reply@commentflow.local>',
  MAILPIT_URL: 'http://10.0.0.1:8025',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
};

describe('buildE2eEnv', () => {
  it('TOKEN_ENC_KEYS: dùng khóa có sẵn; thiếu thì tự sinh khóa v1 hợp lệ, mỗi lần một khác', () => {
    expect(buildE2eEnv({ ...base, TOKEN_ENC_KEYS: 'v1:abc' }, { port: 3123 }).TOKEN_ENC_KEYS).toBe(
      'v1:abc',
    );
    const a = buildE2eEnv(base, { port: 3123 }).TOKEN_ENC_KEYS;
    const b = buildE2eEnv(base, { port: 3123 }).TOKEN_ENC_KEYS;
    expect(a).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('đưa web về DB test, không dùng cf_dev, và đặt URL/cổng/APP_ENV', () => {
    const env = buildE2eEnv(base, { port: 3123 });
    expect(databaseNameOf(env.DATABASE_URL)).toBe('cf_test');
    expect(databaseNameOf(env.DATABASE_ADMIN_URL)).toBe('cf_test');
    expect(databaseNameOf(env.DATABASE_AUTH_URL)).toBe('cf_test');
    expect(env.APP_ENV).toBe('test');
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3123');
    expect(env.E2E_BASE_URL).toBe('http://localhost:3123');
    expect(env.PORT).toBe('3123');
    expect(env.PWNED_CHECK).toBe('off');
    expect(env.REDIS_KEY_PREFIX).toBe('e2e:');
  });

  it('bật SMS MOCK + ảnh đại diện MOCK chỉ cho E2E (APP_ENV=test), hộp thư thử theo cổng', () => {
    const env = buildE2eEnv(base, { port: 3123 });
    expect(env.APP_ENV).toBe('test');
    expect(env.PHONE_VERIFY_ENABLED).toBe('true');
    expect(env.NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED).toBe('true');
    expect(env.SMS_MOCK_OUTBOX_FILE).toContain('cf-e2e-sms-outbox-3123');
  });

  it('có TEST_DATABASE_WORKER_URL → DATABASE_WORKER_URL trỏ DB test (theo làn); không có thì không đặt', () => {
    const w = 'postgresql://cf_worker:pw@10.0.0.1:5433/cf_test';
    expect(buildE2eEnv(base, { port: 3123 }).DATABASE_WORKER_URL).toBeUndefined();
    expect(
      buildE2eEnv({ ...base, TEST_DATABASE_WORKER_URL: w }, { port: 3123 }).DATABASE_WORKER_URL,
    ).toBe(w);
    expect(
      buildE2eEnv({ ...base, TEST_DATABASE_WORKER_URL: w }, { port: 3123, lane: 'b' })
        .DATABASE_WORKER_URL,
    ).toContain('/cf_test_b');
  });

  it('CF_LANE đổi tên DB thành cf_test_<làn> cho cả ba role, giữ nguyên máy/mật khẩu', () => {
    const env = buildE2eEnv(base, { port: 3100, lane: 'b' });
    for (const name of ['DATABASE_URL', 'DATABASE_ADMIN_URL', 'DATABASE_AUTH_URL']) {
      expect(databaseNameOf(env[name])).toBe('cf_test_b');
    }
    expect(env.DATABASE_ADMIN_URL).toContain('cf_owner:pw@10.0.0.1:5433');
  });

  it('SMTP_FROM mặc định khi .env chưa có, giữ giá trị đã đặt', () => {
    const { SMTP_FROM: _from, ...rest } = base;
    expect(buildE2eEnv(rest, { port: 3100 }).SMTP_FROM).toContain('no-reply@commentflow.local');
    expect(buildE2eEnv(base, { port: 3100 }).SMTP_FROM).toBe(base.SMTP_FROM);
  });

  it('đọc CF_LANE từ biến môi trường khi không truyền tham số', () => {
    const env = buildE2eEnv({ ...base, CF_LANE: 'a' }, { port: 3100 });
    expect(databaseNameOf(env.DATABASE_URL)).toBe('cf_test_a');
  });

  it('từ chối DB không phải cf_test* và làn có ký tự lạ', () => {
    const dev = { ...base, TEST_DATABASE_URL: 'postgresql://u:p@h:5433/cf_dev' };
    expect(() => buildE2eEnv(dev, { port: 3100 })).toThrow(/cf_dev/);
    expect(() => buildE2eEnv(base, { port: 3100, lane: 'B;drop' })).toThrow(/CF_LANE/);
    expect(() => testDatabaseUrl('postgresql://u:p@h/cf_prod', '')).toThrow();
  });

  it('thiếu biến thì chỉ nêu TÊN biến, không lộ giá trị', () => {
    const { MAILPIT_URL: _a, REDIS_URL: _b, ...rest } = base;
    const error = (() => {
      try {
        buildE2eEnv(rest, { port: 3100 });
      } catch (e) {
        return String(e);
      }
      return '';
    })();
    expect(error).toContain('MAILPIT_URL');
    expect(error).toContain('REDIS_URL');
    expect(error).not.toContain('pw@');
    expect(REQUIRED_VARS).toContain('BETTER_AUTH_SECRET');
  });
});
