import { describe, expect, it } from 'vitest';
import { assertFlagsDatabase, parseFlagsArgs } from './flags-admin';

/** CLI ghi cờ chỉ cho DB dev/test/ci (ADMIN-FLAGS-PAGE chưa có; staging/production KHÔNG đi đường này). */
describe('assertFlagsDatabase', () => {
  const url = (db: string) => `postgresql://cf_owner:pw@localhost:5432/${db}`;

  it('cho cf_dev, cf_test, cf_test_<làn>, cf_ci', () => {
    for (const db of ['cf_dev', 'cf_test', 'cf_test_b', 'cf_ci']) {
      expect(() => assertFlagsDatabase(url(db), 'dev')).not.toThrow();
    }
  });

  it('từ chối DB khác (staging/production/lạ) và thiếu URL', () => {
    for (const db of ['cf_staging', 'cf_prod', 'commentflow', 'cf_dev2', 'cf_test; drop']) {
      expect(() => assertFlagsDatabase(url(db), 'dev')).toThrow(/cf_dev/);
    }
    expect(() => assertFlagsDatabase(undefined, 'dev')).toThrow(/DATABASE_ADMIN_URL/);
  });

  it('từ chối APP_ENV staging/production dù DB đúng tên', () => {
    for (const env of ['staging', 'production']) {
      expect(() => assertFlagsDatabase(url('cf_dev'), env)).toThrow(/APP_ENV/);
    }
  });
});

describe('parseFlagsArgs', () => {
  it('<khóa> on|off; mặc định toàn hệ thống', () => {
    expect(parseFlagsArgs(['--', 'cf.ai.draft', 'on'])).toEqual({
      key: 'cf.ai.draft',
      enabled: true,
      workspaceId: null,
      kind: 'ops',
      reason: null,
    });
    expect(parseFlagsArgs(['cf.ai.draft', 'off']).enabled).toBe(false);
  });

  it('--workspace <uuid>, --kind, --reason', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      parseFlagsArgs([
        'cf.pipeline.v2',
        'on',
        '--workspace',
        id,
        '--kind',
        'release',
        '--reason',
        'thử',
      ]),
    ).toMatchObject({ workspaceId: id, kind: 'release', reason: 'thử' });
  });

  it('khóa/giá trị/uuid sai → lỗi cách dùng', () => {
    for (const bad of [
      [],
      ['cf.ai.draft'],
      ['cf.ai.draft', 'maybe'],
      ['Khoa Sai', 'on'],
      ['cf.ai.draft', 'on', '--workspace', 'khong-phai-uuid'],
      ['cf.ai.draft', 'on', '--kind', 'lạ'],
      ['cf.ai.draft', 'on', '--lạ'],
    ]) {
      expect(() => parseFlagsArgs(bad)).toThrow(/Cách dùng|không hợp lệ/);
    }
  });
});
