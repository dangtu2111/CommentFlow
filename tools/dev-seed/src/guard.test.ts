import { describe, expect, it } from 'vitest';
import { assertDbMarkerAllowed, assertDevSeedAllowed } from './guard';

const url = (db: string, user = 'cf_owner') => `postgresql://${user}:x@127.0.0.1:5433/${db}`;
const ok = {
  appEnv: 'dev',
  adminUrl: url('cf_dev'),
  appUrl: url('cf_dev', 'cf_app'),
  workerUrl: url('cf_dev', 'cf_worker'),
};

describe('DEV-SEED-DEMO guard môi trường', () => {
  it('cho qua dev + cf_dev (ba URL cùng DB)', () => {
    expect(assertDevSeedAllowed(ok)).toBe('cf_dev');
  });

  it.each([undefined, '', 'staging', 'production', 'test', 'ci', 'DEV'])(
    'từ chối APP_ENV=%s',
    (appEnv) => {
      expect(() => assertDevSeedAllowed({ ...ok, appEnv })).toThrow(/APP_ENV/);
    },
  );

  it.each([
    'cf_test',
    'cf_test_a',
    'cf_ci',
    'cf_staging',
    'cf_prod',
    'cf_dev2',
    'xcf_dev',
    'postgres',
  ])('từ chối database %s', (db) => {
    expect(() => assertDevSeedAllowed({ ...ok, adminUrl: url(db) })).toThrow(/cf_dev/);
  });

  it('từ chối khi thiếu URL admin/app/worker', () => {
    expect(() => assertDevSeedAllowed({ ...ok, adminUrl: undefined })).toThrow(
      /DATABASE_ADMIN_URL/,
    );
    expect(() => assertDevSeedAllowed({ ...ok, appUrl: undefined })).toThrow(/DATABASE_URL/);
    expect(() => assertDevSeedAllowed({ ...ok, workerUrl: undefined })).toThrow(
      /DATABASE_WORKER_URL/,
    );
  });

  it('từ chối URL hỏng mà không lộ mật khẩu', () => {
    const bad = 'not a url secret-pw';
    expect(() => assertDevSeedAllowed({ ...ok, adminUrl: bad })).toThrow(/định dạng/);
    try {
      assertDevSeedAllowed({ ...ok, adminUrl: bad });
    } catch (e) {
      expect(String(e)).not.toContain('secret-pw');
    }
  });

  it('từ chối khi URL app hoặc worker trỏ DB khác', () => {
    expect(() => assertDevSeedAllowed({ ...ok, appUrl: url('cf_test', 'cf_app') })).toThrow(
      /cf_dev/,
    );
    expect(() =>
      assertDevSeedAllowed({ ...ok, workerUrl: url('cf_staging', 'cf_worker') }),
    ).toThrow(/cf_dev/);
  });

  it('không lộ mật khẩu trong thông báo lỗi', () => {
    try {
      assertDevSeedAllowed({ ...ok, adminUrl: 'postgresql://cf_owner:hunter2@h:1/cf_prod' });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain('hunter2');
    }
  });
});

describe('DEV-SEED-DEMO dấu cf.env của DB', () => {
  it.each([null, undefined, '', 'dev'])('cho qua dấu %s', (marker) => {
    expect(() => assertDbMarkerAllowed({ database: 'cf_dev', marker })).not.toThrow();
  });

  it.each(['staging', 'production', 'Staging', ' production '])('từ chối dấu %s', (marker) => {
    expect(() => assertDbMarkerAllowed({ database: 'cf_dev', marker })).toThrow(/cf\.env/);
  });

  it('từ chối khi database thật sự đang kết nối khác cf_dev', () => {
    expect(() => assertDbMarkerAllowed({ database: 'cf_test', marker: null })).toThrow(/cf_dev/);
  });
});
