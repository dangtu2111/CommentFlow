import { describe, expect, it } from 'vitest';
import {
  parseAdminCliEnv,
  parseCheckRlsEnv,
  parseStagingCliEnv,
  parseTestResetEnv,
} from './cli-env';

describe('cli-env (CLI đọc env qua parseEnv/Zod)', () => {
  it('migrate: chỉ lấy APP_ENV và DATABASE_ADMIN_URL, bỏ biến khác', () => {
    const env = parseAdminCliEnv({
      APP_ENV: 'dev',
      DATABASE_ADMIN_URL: 'postgres://x',
      SECRET_KHAC: 'khong-duoc-lot-vao',
    });
    expect(env).toEqual({ APP_ENV: 'dev', DATABASE_ADMIN_URL: 'postgres://x' });
  });

  it('migrate: thiếu biến vẫn qua (cổng migration-guard báo lỗi có nghĩa)', () => {
    expect(parseAdminCliEnv({})).toEqual({});
  });

  it('test-reset: lấy TEST_DATABASE_ADMIN_URL', () => {
    const env = parseTestResetEnv({ APP_ENV: 'test', TEST_DATABASE_ADMIN_URL: 'postgres://t' });
    expect(env.TEST_DATABASE_ADMIN_URL).toBe('postgres://t');
  });

  it('check-rls: chọn URL test khi CHECK_RLS_TEST=1, ngược lại URL admin', () => {
    const base = { DATABASE_ADMIN_URL: 'postgres://a', TEST_DATABASE_ADMIN_URL: 'postgres://t' };
    expect(parseCheckRlsEnv({ ...base, CHECK_RLS_TEST: '1' }).url).toBe('postgres://t');
    expect(parseCheckRlsEnv(base).url).toBe('postgres://a');
    expect(parseCheckRlsEnv({}).url).toBeUndefined();
  });

  it('staging: lấy đủ 7 biến của cổng staging, bỏ biến lạ', () => {
    const env = parseStagingCliEnv({
      APP_ENV: 'staging',
      DATABASE_ADMIN_URL: 'postgres://s',
      CF_STAGING_DB_HOSTS: 'h',
      CF_STAGING_DB_NAME: 'n',
      CF_CONFIRM_STAGING_MIGRATE: 'n@1',
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW_REF: 'ref',
      PATH: '/bin',
    });
    expect(Object.keys(env).sort()).toEqual([
      'APP_ENV',
      'CF_CONFIRM_STAGING_MIGRATE',
      'CF_STAGING_DB_HOSTS',
      'CF_STAGING_DB_NAME',
      'DATABASE_ADMIN_URL',
      'GITHUB_ACTIONS',
      'GITHUB_WORKFLOW_REF',
    ]);
  });
});
