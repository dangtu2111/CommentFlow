import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { assertMigrationAllowed, assertTestResetAllowed } from './migration-guard';

const url = (db: string, host = '192.168.1.124') => `postgresql://u:p@${host}:5433/${db}`;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isAppError(error) ? error.code : 'KHÁC';
  }
  return undefined;
}

describe('assertMigrationAllowed', () => {
  it('cho phép cf_dev, cf_test, cf_ci với APP_ENV dev/test/ci', () => {
    expect(assertMigrationAllowed({ appEnv: 'dev', databaseUrl: url('cf_dev') })).toBe('cf_dev');
    expect(assertMigrationAllowed({ appEnv: 'test', databaseUrl: url('cf_test') })).toBe('cf_test');
    expect(assertMigrationAllowed({ appEnv: 'ci', databaseUrl: url('cf_ci', 'localhost') })).toBe(
      'cf_ci',
    );
  });

  it('từ chối APP_ENV khác hoặc thiếu (staging, production, trống)', () => {
    for (const appEnv of ['staging', 'production', 'prod', '', undefined]) {
      expect(codeOf(() => assertMigrationAllowed({ appEnv, databaseUrl: url('cf_dev') }))).toBe(
        'FORBIDDEN',
      );
    }
  });

  it('từ chối tên database ngoài danh sách cho phép (commentflow, postgres, litellm…)', () => {
    for (const db of ['commentflow', 'postgres', 'litellm', 'langfuse', 'cf_dev2', 'xcf_dev']) {
      expect(codeOf(() => assertMigrationAllowed({ appEnv: 'dev', databaseUrl: url(db) }))).toBe(
        'FORBIDDEN',
      );
    }
  });

  it('từ chối URL sai hoặc thiếu và không lộ mật khẩu trong thông báo', () => {
    expect(codeOf(() => assertMigrationAllowed({ appEnv: 'dev', databaseUrl: undefined }))).toBe(
      'CONFIG_INVALID',
    );
    try {
      assertMigrationAllowed({
        appEnv: 'dev',
        databaseUrl: 'postgresql://u:matkhau-bi-mat@h:1/commentflow',
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('matkhau-bi-mat');
    }
  });

  it('không bị đánh lừa bởi tên DB trong query string hay phần khác của URL', () => {
    const tricky = 'postgresql://u:p@h:5433/commentflow?options=cf_dev';
    expect(codeOf(() => assertMigrationAllowed({ appEnv: 'dev', databaseUrl: tricky }))).toBe(
      'FORBIDDEN',
    );
  });
});

describe('assertTestResetAllowed', () => {
  it('chỉ cho tạo lại schema trên cf_test và cf_ci', () => {
    expect(assertTestResetAllowed({ appEnv: 'test', databaseUrl: url('cf_test') })).toBe('cf_test');
    expect(assertTestResetAllowed({ appEnv: 'ci', databaseUrl: url('cf_ci') })).toBe('cf_ci');
  });

  it('từ chối cf_dev (dữ liệu dev không được xóa)', () => {
    expect(
      codeOf(() => assertTestResetAllowed({ appEnv: 'dev', databaseUrl: url('cf_dev') })),
    ).toBe('FORBIDDEN');
  });

  it('vẫn áp dụng luật APP_ENV của migrate', () => {
    expect(
      codeOf(() => assertTestResetAllowed({ appEnv: 'production', databaseUrl: url('cf_test') })),
    ).toBe('FORBIDDEN');
  });
});

describe('DB test theo làn (cf_test_<làn>)', () => {
  it('cho migrate và xóa-tạo lại trên cf_test_b, cf_test_a1', () => {
    for (const db of ['cf_test_a', 'cf_test_b', 'cf_test_c', 'cf_test_a1', 'cf_test_abcdefgh']) {
      expect(assertMigrationAllowed({ appEnv: 'test', databaseUrl: url(db) })).toBe(db);
      expect(assertTestResetAllowed({ appEnv: 'test', databaseUrl: url(db) })).toBe(db);
    }
  });

  it('từ chối tên lạ: cf_test_, cf_testx, hoa, quá dài, ký tự đặc biệt', () => {
    for (const db of [
      'cf_test_',
      'cf_testx',
      'cf_test_B',
      'cf_test_abcdefghi',
      'cf_test_a-b',
      'cf_test_a_b',
      'cf_dev_a',
      'commentflow',
    ]) {
      expect(codeOf(() => assertMigrationAllowed({ appEnv: 'test', databaseUrl: url(db) }))).toBe(
        'FORBIDDEN',
      );
      expect(codeOf(() => assertTestResetAllowed({ appEnv: 'test', databaseUrl: url(db) }))).toBe(
        'FORBIDDEN',
      );
    }
  });

  it('cf_dev vẫn không được reset; staging/production vẫn bị chặn theo APP_ENV', () => {
    expect(
      codeOf(() => assertTestResetAllowed({ appEnv: 'dev', databaseUrl: url('cf_dev') })),
    ).toBe('FORBIDDEN');
    for (const appEnv of ['staging', 'production']) {
      expect(codeOf(() => assertMigrationAllowed({ appEnv, databaseUrl: url('cf_test_b') }))).toBe(
        'FORBIDDEN',
      );
    }
  });
});
