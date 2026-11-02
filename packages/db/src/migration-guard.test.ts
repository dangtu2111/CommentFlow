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
