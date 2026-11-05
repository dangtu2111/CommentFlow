import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { QUEUES } from './definitions';
import { installQueueSchemaStaging } from './install';

// Địa chỉ không tồn tại: nếu mã lỡ kết nối thì test sẽ lỗi/treo — dry-run và các lần từ chối không được kết nối.
const ADMIN_URL = 'postgresql://cf_owner:matkhau-bi-mat@db.staging.invalid:5432/cf_staging';
const baseEnv = {
  APP_ENV: 'staging',
  DATABASE_ADMIN_URL: ADMIN_URL,
  CF_STAGING_DB_HOSTS: 'db.staging.invalid',
};

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : 'KHÁC';
  }
  return undefined;
}

const run = (env: Record<string, string | undefined>, dryRun: boolean, lines: string[] = []) =>
  installQueueSchemaStaging({ env, dryRun, queues: QUEUES, log: (l) => lines.push(l) });

describe('installQueueSchemaStaging', () => {
  it('thiếu mã xác nhận → từ chối, không kết nối', async () => {
    expect(await codeOf(run(baseEnv, false))).toBe('FORBIDDEN');
  });

  it('sai mã xác nhận → từ chối', async () => {
    const env = { ...baseEnv, CF_CONFIRM_STAGING_MIGRATE: 'cf_staging@0000' };
    expect(await codeOf(run(env, false))).toBe('FORBIDDEN');
  });

  it('production và APP_ENV sai → từ chối cứng', async () => {
    for (const APP_ENV of ['production', 'dev', undefined]) {
      expect(await codeOf(run({ ...baseEnv, APP_ENV }, true))).toBe('FORBIDDEN');
    }
  });

  it('host ngoài danh sách hoặc thiếu danh sách → từ chối', async () => {
    expect(await codeOf(run({ ...baseEnv, CF_STAGING_DB_HOSTS: 'khac.example' }, true))).toBe(
      'FORBIDDEN',
    );
    expect(await codeOf(run({ ...baseEnv, CF_STAGING_DB_HOSTS: undefined }, true))).toBe(
      'CONFIG_INVALID',
    );
  });

  it('dry-run không cần xác nhận, không kết nối, liệt kê hàng đợi, không lộ bí mật', async () => {
    const lines: string[] = [];
    await run(baseEnv, true, lines);
    const text = lines.join('\n');
    for (const q of QUEUES) expect(text).toContain(q.name);
    expect(text).toContain('cf_staging');
    for (const secret of ['matkhau-bi-mat', 'cf_owner', 'db.staging.invalid']) {
      expect(text).not.toContain(secret);
    }
  });
});
